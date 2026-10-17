import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makePlan, executionPlan } from '../core/plans.mjs';
import { checkEvidence } from '../core/checker.mjs';
import { executePlan } from '../.runtime/runner.mjs';
for (const amount of [2900, 7317]) {
  test(`Reference handler satisfies all ten contracts at ${amount} cents`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rehearsal-test-'));
    for (let i = 1; i <= 10; i++) {
      const id = `S${String(i).padStart(2, '0')}`, plan = makePlan(id, { amount });
      const evidence = await executePlan(executionPlan(plan), path.resolve('candidates/reference.mjs'), path.join(root, id));
      const result = checkEvidence(plan, evidence);
      assert.equal(result.status, 'passed', `${id}: ${JSON.stringify(result.assertions.filter(x => !x.passed))}\n${result.stderr}`);
    }
  });
}
test('Starter exposes meaningful failures, while the happy path works', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rehearsal-starter-'));
  const results = [];
  for (let i = 1; i <= 10; i++) {
    const id = `S${String(i).padStart(2, '0')}`, plan = makePlan(id);
    results.push(checkEvidence(plan, await executePlan(executionPlan(plan), path.resolve('candidates/starter.mjs'), path.join(root, id))));
  }
  assert.equal(results[0].status, 'passed');
  for (const id of ['S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10']) assert.equal(results.find(r => r.id === id).status, 'failed', `${id} should expose the flaw`);
});
test('Checker rejects absent evidence and fulfillment under the wrong customer', () => {
  const plan = makePlan('S01'); assert.equal(checkEvidence(plan, {}).status, 'failed');
  assert.equal(checkEvidence(plan, { checkpoints: [{ results: [{ status: 200 }], state: { customers: [], effects: [{ customer_id: 'attacker', amount: 2900 }] } }] }).status, 'failed');
});
