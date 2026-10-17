import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import Stripe from 'stripe';
process.on('message', async (job) => {
  if (job.type !== 'start') return;
  const db = new DatabaseSync(job.dbPath);
  db.exec('PRAGMA busy_timeout=5000');
  const waitFor = (name) => new Promise(resolve => {
    const receive = msg => { if (msg.type === name) { process.off('message', receive); resolve(); } };
    process.on('message', receive);
  });
  try {
    const candidate = await import(pathToFileURL(job.candidatePath).href);
    const ctx = { db, now: job.step.now, reference: job.step.reference, policy: { graceHours: 72 }, nonce: randomUUID,
      verify: (raw, sig) => Stripe.webhooks.constructEvent(raw, sig, job.secret),
      barrier: async () => { if (job.parallel) { const wait = waitFor('release'); process.send({ type: 'barrier' }); await wait; } },
      afterCommit: async () => { if (job.step.fault === 'crash-after-commit') { const wait = waitFor('continue'); process.send({ type: 'after-commit' }); await wait; } }
    };
    const result = job.step.kind === 'reconcile' ? await candidate.reconcile(ctx) : await candidate.handle(ctx, job.raw, job.signature);
    process.send({ type: 'result', result });
  } catch (error) { process.send({ type: 'result', result: { status: 500, error: String(error.message).slice(0, 1000) } }); }
  finally { db.close(); process.disconnect(); }
});
