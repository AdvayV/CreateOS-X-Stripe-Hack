import { DatabaseSync } from 'node:sqlite';
import { fork } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export async function executePlan(plan, candidatePath, root) {
  const start = Date.now();
  fs.mkdirSync(root, { recursive: true });
  const dbPath = path.resolve(root, 'state.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE customers(id TEXT PRIMARY KEY, stripe_customer_id TEXT UNIQUE, plan TEXT, access INTEGER, paid_through INTEGER, grace_until INTEGER); CREATE TABLE effects(id INTEGER PRIMARY KEY, business_key TEXT UNIQUE NOT NULL, invoice_id TEXT, subscription_id TEXT, customer_id TEXT, amount INTEGER, currency TEXT); CREATE TABLE processed(event_id TEXT PRIMARY KEY);`);
  for (const x of plan.initial.customers) db.prepare('INSERT INTO customers VALUES(?,?,?,?,?,?)').run(x.id, x.stripe_customer_id, x.plan, x.access, x.paid_through, x.grace_until);
  const checkpoints = []; let stderr = '';
  const secret = 'whsec_' + randomBytes(24).toString('hex');
  for (const step of plan.steps) {
    const children = []; let barrierCount = 0;
    const timestamp = Math.floor(Date.now() / 1000);
    let raw = JSON.stringify(step.event);
    const digest = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
    const signature = `t=${timestamp},v1=${step.invalid === 'signature' ? '0'.repeat(64) : digest}`;
    if (step.invalid === 'tampered') raw = raw.replace('invoice.paid', 'invoice.paid ');
    const count = step.kind === 'parallel' ? 2 : 1;
    const launch = () => new Promise(resolve => {
      // Node permissions limit candidate file writes to its own scenario state.
      const child = fork(path.join(here, 'worker.bundle.mjs'), [], { silent: true, execArgv: ['--permission', `--allow-fs-read=${here}`, `--allow-fs-read=${path.resolve(candidatePath)}`, `--allow-fs-read=${path.resolve(root)}`, `--allow-fs-write=${path.resolve(root)}`], env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', NODE_NO_WARNINGS: '1' } });
      children.push(child); let result = null, crashed = false, done = false, launchError = null;
      const finish = (value) => { if (!done) { done = true; clearTimeout(timeout); resolve(value); } };
      const timeout = setTimeout(() => { child.kill('SIGKILL'); finish({ status: 504, error: 'Worker exceeded its execution deadline.' }); }, 12000);
      child.stdout.on('data', () => {});
      child.stderr.on('data', b => { stderr = (stderr + b.toString()).slice(-12000); });
      child.on('error', e => { launchError = e.message; if (!child.pid) finish({ status: 500, error: e.message }); });
      child.on('message', msg => {
        if (msg.type === 'barrier') { barrierCount++; if (barrierCount === count) for (const c of children) c.send({ type: 'release' }); }
        if (msg.type === 'after-commit') { crashed = true; child.kill('SIGKILL'); }
        if (msg.type === 'result') result = msg.result;
      });
      child.on('close', (code, signal) => finish(crashed ? { crashedAfterCommit: true, exitCode: code, signal } : { ...(result ?? { status: 500, error: launchError || 'Worker exited without a result.' }), exitCode: code, signal }));
      child.send({ type: 'start', step, dbPath, candidatePath: path.resolve(candidatePath), secret, timestamp, raw, signature, parallel: count === 2 }, e => { if (e) launchError = e.message; });
    });
    const results = await Promise.all(Array.from({ length: count }, launch));
    checkpoints.push({ label: step.label, now: step.now, eventType: step.event?.type ?? 'scheduled.reconciliation', eventId: step.event?.id ?? null, results, barrierCount, state: { customers: db.prepare('SELECT * FROM customers ORDER BY id').all(), effects: db.prepare('SELECT * FROM effects ORDER BY id').all(), processed: db.prepare('SELECT * FROM processed ORDER BY event_id').all() } });
  }
  db.close();
  return { checkpoints, durationMs: Date.now() - start, stderr };
}
if (process.argv[2] === '--run') {
  const input = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  executePlan(input.plan, input.candidatePath, input.root).then(x => { fs.writeFileSync(input.output, JSON.stringify(x)); console.log(JSON.stringify({ scenario: input.plan.id, checkpoints: x.checkpoints.length, durationMs: x.durationMs })); }).catch(e => { console.error(e.message); process.exitCode = 1; });
}
