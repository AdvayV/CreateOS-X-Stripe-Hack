import dotenv from 'dotenv';
dotenv.config({ quiet: true });
dotenv.config({ path: '.env.app', quiet: true });
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTwoFilesPatch } from 'diff';
import { makePlan, TITLES } from '../core/plans.mjs';
import { checkEvidence } from '../core/checker.mjs';
import { createExecutor, cloudClient, approvals, dataRoot } from './execution.mjs';
import { generateRepair } from './repair.mjs';
import { captureStripeFixture, seedStripeFixture } from './stripe-fixtures.mjs';
import { commerceStatus, chargeTestRehearsal } from './commerce.mjs';
import { DatabaseSync } from 'node:sqlite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const contract = JSON.parse(await fs.readFile(path.join(root, 'scenarios/billing-scenarios.json'), 'utf8'));
const starter = await fs.readFile(path.join(root, 'candidates/starter.mjs'), 'utf8');
const reference = await fs.readFile(path.join(root, 'candidates/reference.mjs'), 'utf8');
const sessions = new Map(); let active = null; let fixture = null; let vite;
const hash = x => createHash('sha256').update(x).digest('hex');
const contractHash = hash(JSON.stringify(contract));
await fs.mkdir(path.join(dataRoot, 'reports'), { recursive: true });
const orders = new DatabaseSync(path.join(dataRoot, 'commerce.db'));
orders.exec('CREATE TABLE IF NOT EXISTS orders(purchase_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, created_at TEXT NOT NULL, invoice_amount INTEGER)');
if (!orders.prepare('PRAGMA table_info(orders)').all().some(x => x.name === 'invoice_amount')) orders.exec('ALTER TABLE orders ADD COLUMN invoice_amount INTEGER');
const send = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const readBody = async req => { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 60000) throw new Error('Request is too large.'); } return JSON.parse(body || '{}'); };
const emit = (session, type, data) => { const event = { sequence: session.events.length, type, data, at: new Date().toISOString() }; session.events.push(event); for (const c of session.clients) c.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`); };
async function suite(session, code, phase) {
  const out = [];
  emit(session, 'phase', { phase, message: phase === 'baseline' ? 'Running the deliberately flawed handler' : 'Verifying the repaired handler against unchanged checks' });
  const executor = await createExecutor(session.mode, code, (type, data) => emit(session, type, data));
  session.sandboxes.push({ id: executor.id, mode: executor.mode, phase });
  try {
    for (let i = 0; i < 10; i++) {
      if (session.canceled) throw new Error('Run canceled.');
      const id = `S${String(i + 1).padStart(2, '0')}`, plan = makePlan(id, { ...session.fixtureSource, amount: session.amount });
      emit(session, 'scenario-start', { id, phase, title: plan.title });
      let result;
      try { result = checkEvidence(plan, await executor.scenario(plan)); }
      catch (e) { result = { id, title: plan.title, status: 'error', error: e.message, assertions: [], failedAssertions: 1, checkpoints: [] }; }
      out.push(result); emit(session, 'scenario-result', { ...result, phase });
    }
  } finally { await executor.close(); }
  session[phase] = out; return out;
}
async function persist(s) { const { clients, events, ...report } = s; report.events = events; await fs.writeFile(path.join(dataRoot, 'reports', `${s.id}.json`), JSON.stringify(report, null, 2)); }
async function run(session) {
  try {
    await suite(session, starter, 'baseline');
    emit(session, 'baseline-complete', { passed: session.baseline.filter(x => x.status === 'passed').length, total: 10 });
    session.status = 'awaiting-repair'; emit(session, 'ready', { message: 'Inspect evidence, then choose a reference patch or an approved AI repair.' });
  } catch (e) { session.status = 'error'; emit(session, 'run-error', { message: e.message }); }
  finally { active = null; await persist(session); }
}
async function repair(session, mode) {
  try {
    if (mode === 'ai' && session.mode !== 'createos') throw new Error('AI-generated code can only execute in CreateOS.');
    session.status = 'repairing'; session.repairKind = mode; let code = reference;
    if (mode === 'ai') {
      let current = starter, results = session.baseline;
      for (let attempt = 1; attempt <= 2; attempt++) {
        emit(session, 'log', { message: `AI attempt ${attempt}: generating a repair from failing business assertions.` });
        const patch = await generateRepair(current, results, attempt);
        code = patch.code; session.ai = { ...patch, code: undefined };
        session.patch = createTwoFilesPatch('handler.before.mjs', 'handler.after.mjs', starter, code);
        emit(session, 'patch', { diff: session.patch, code, kind: 'ai', summary: patch.summary, changes: patch.changes });
        results = await suite(session, code, 'repaired'); current = code;
        if (results.every(r => r.status === 'passed')) break;
      }
    } else {
      session.patch = createTwoFilesPatch('handler.before.mjs', 'handler.reference.mjs', starter, reference);
      emit(session, 'patch', { diff: session.patch, code, kind: 'reference', summary: 'Bundled reference patch · no AI call', changes: ['Verify signatures over raw bytes', 'Atomically deduplicate invoice fulfillment', 'Reconcile authoritative subscription state', 'Honor renewal grace and paid-through periods'] });
      await suite(session, code, 'repaired');
    }
    session.status = session.repaired.every(x => x.status === 'passed') ? 'complete' : 'needs-review';
    session.completedAt = new Date().toISOString(); session.candidateHash = hash(code);
    emit(session, 'complete', { status: session.status, passed: session.repaired.filter(x => x.status === 'passed').length, total: 10, kind: mode });
  } catch (e) { session.status = 'error'; emit(session, 'run-error', { message: e.message }); }
  finally { active = null; await persist(session); }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const host = req.headers.host?.split(':')[0];
    if (!['127.0.0.1', 'localhost'].includes(host)) return send(res, 403, { error: 'Loopback access only.' });
    if (req.method === 'POST' && req.headers.origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) return send(res, 403, { error: 'Origin not allowed.' });
    if (url.pathname === '/api/config') {
      const p = await approvals();
      return send(res, 200, { scenarios: contract.scenarios.map((s, i) => ({ ...s, shortTitle: TITLES[i] })), contractHash, starter, reference, createosConfigured: !!(process.env.CREATEOS_SANDBOX_API_KEY || process.env.CREATEOS_PROJECT_API_KEY || process.env.CREATEOS_PLAN_API_KEY), createosApproved: !!p.createos && p.cloudSecondsRemaining >= 300, cloudSecondsRemaining: p.cloudSecondsRemaining, aiConfigured: !!process.env.OPENAI_API_KEY, aiApproved: !!p.ai && process.env.ALLOW_PAID_AI === 'true', fixture, commerce: commerceStatus(), activeRun: active });
    }
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, product: 'Rehearsal' });
    if (url.pathname === '/api/commerce/status') return send(res, 200, commerceStatus());
    if (url.pathname === '/api/commerce/rehearsals' && req.method === 'POST') {
      const body = await readBody(req);
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(body.purchaseId ?? '')) return send(res, 400, { error: 'A stable purchaseId of 8–100 letters, digits, underscores or hyphens is required.' });
      const existing = orders.prepare('SELECT run_id, invoice_amount FROM orders WHERE purchase_id = ?').get(body.purchaseId);
      if (existing) { if (existing.invoice_amount !== Number(body.amount ?? 2900)) return send(res, 409, { error: 'This purchaseId belongs to a different request. Reuse it only for retries of the same purchase.' }); return send(res, 200, { id: existing.run_id, replayed: true, reportUrl: `/api/runs/${existing.run_id}/report`, testMode: true }); }
      if (active) return send(res, 409, { error: 'A verification is in progress. Retry later with the same purchaseId; no payment was attempted.' });
      const permission = await approvals();
      if (!permission.createos || permission.cloudSecondsRemaining < 300) return send(res, 503, { error: 'Execution allowance unavailable; no payment was attempted.' });
      const amount = Number(body.amount ?? 2900);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) return send(res, 400, { error: 'Invalid invoice fixture amount.' });
      active = `payment:${body.purchaseId}`;
      let payment;
      try { payment = await chargeTestRehearsal(req, body, port); }
      finally { if (active === `payment:${body.purchaseId}`) active = null; }
      if (payment.error) return send(res, payment.status, { error: payment.error });
      if (payment.challenge) { res.writeHead(payment.challenge.status, Object.fromEntries(payment.challenge.headers)); res.end(await payment.challenge.text()); return; }
      const session = { id: randomUUID(), createdAt: new Date().toISOString(), mode: 'createos', amount, status: 'running', baseline: [], repaired: [], events: [], clients: new Set(), sandboxes: [], fixtureSource: fixture || { source: 'synthetic' }, codeHash: hash(starter), contractHash, commerce: { purchaseId: body.purchaseId, testMode: true, priceCents: 50 } };
      sessions.set(session.id, session); active = session.id;
      orders.prepare('INSERT INTO orders(purchase_id,run_id,created_at,invoice_amount) VALUES(?,?,?,?)').run(body.purchaseId, session.id, session.createdAt, amount);
      const response = payment.withReceipt(Response.json({ id: session.id, testMode: true, reportUrl: `/api/runs/${session.id}/report` }, { status: 202 }));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); void run(session); return;
    }
    if (url.pathname === '/api/integrations/createos' && req.method === 'POST') { await cloudClient().whoami(); return send(res, 200, { connected: true, message: 'CreateOS API authenticated. No sandbox created.' }); }
    if (url.pathname === '/api/integrations/stripe' && req.method === 'POST') { const body = await readBody(req); fixture = body.seed ? await seedStripeFixture() : await captureStripeFixture(); return send(res, 200, fixture); }
    if (url.pathname === '/api/runs' && req.method === 'POST') {
      if (active) return send(res, 409, { error: 'A rehearsal is already running.' });
      const body = await readBody(req);
      if (!['local', 'createos'].includes(body.mode)) return send(res, 400, { error: 'Choose local or createos execution.' });
      const amount = Number(body.amount ?? fixture?.amount ?? 2900);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) return send(res, 400, { error: 'Amount must be 1–10,000,000 cents.' });
      if (body.mode === 'createos') { const a = await approvals(); if (!a.createos || a.cloudSecondsRemaining < 300) return send(res, 403, { error: 'CreateOS usage needs approval or the approved allowance is exhausted.' }); }
      const session = { id: randomUUID(), createdAt: new Date().toISOString(), mode: body.mode, amount, status: 'running', baseline: [], repaired: [], events: [], clients: new Set(), sandboxes: [], fixtureSource: fixture ? { ...fixture } : { source: 'synthetic', description: 'Controlled synthetic Stripe-shaped fixture; no Stripe API call.' }, codeHash: hash(starter), contractHash };
      sessions.set(session.id, session); active = session.id;
      send(res, 202, { id: session.id }); void run(session); return;
    }
    const match = url.pathname.match(/^\/api\/runs\/([a-f0-9-]+)(?:\/(events|repair|report|cancel))?$/);
    if (match) {
      let session = sessions.get(match[1]);
      if (!session) { try { session = { ...JSON.parse(await fs.readFile(path.join(dataRoot, 'reports', `${match[1]}.json`), 'utf8')), clients: new Set() }; sessions.set(session.id, session); } catch { return send(res, 404, { error: 'Run not found.' }); } }
      if (match[2] === 'events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        const last = Number(req.headers['last-event-id'] ?? -1);
        for (const event of session.events) if (event.sequence > last) res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`);
        session.clients.add(res); const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
        req.on('close', () => { clearInterval(heartbeat); session.clients.delete(res); }); return;
      }
      if (match[2] === 'repair' && req.method === 'POST') {
        if (active || !['awaiting-repair', 'complete', 'needs-review', 'error'].includes(session.status) || session.baseline.length !== 10) return send(res, 409, { error: 'Finish a baseline before repairing.' });
        const body = await readBody(req); if (!['reference', 'ai'].includes(body.mode)) return send(res, 400, { error: 'Unknown repair mode.' });
        if (body.mode === 'ai' && (!(await approvals()).ai || process.env.ALLOW_PAID_AI !== 'true')) return send(res, 403, { error: 'Paid AI usage is deferred. No AI request was made.' });
        active = session.id; session.canceled = false; session.repaired = [];
        send(res, 202, { accepted: true }); void repair(session, body.mode); return;
      }
      if (match[2] === 'cancel' && req.method === 'POST') { session.canceled = true; return send(res, 200, { canceled: true }); }
      const { clients, ...report } = session;
      if (match[2] === 'report') res.setHeader('Content-Disposition', `attachment; filename="rehearsal-${session.id.slice(0, 8)}.json"`);
      return send(res, 200, report);
    }
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Unknown endpoint.' });
    if (vite) return vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
    const target = path.resolve(root, 'dist', '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!target.startsWith(path.join(root, 'dist') + path.sep)) return send(res, 403, { error: 'Invalid path.' });
    const bytes = await fs.readFile(target);
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(target)] || 'application/octet-stream' }); res.end(bytes);
  } catch (e) { if (!res.headersSent) send(res, 400, { error: e.message }); else res.end(); }
});
if (process.argv.includes('--dev')) { const { createServer } = await import('vite'); vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' }); }
server.listen(port, '127.0.0.1', () => console.log(`Rehearsal is ready at http://localhost:${port}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const s of sessions.values()) s.canceled = true; server.close(); void vite?.close(); });
