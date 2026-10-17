import dotenv from 'dotenv'; dotenv.config({ quiet: true });
import './build-runtime.mjs';
import fs from 'node:fs/promises';
import { makePlan } from '../core/plans.mjs';
import { checkEvidence } from '../core/checker.mjs';
import { createExecutor } from '../server/execution.mjs';
const results = [];
for (const candidate of process.argv.includes('--reference-only') ? ['reference'] : ['starter', 'reference']) {
  const code = await fs.readFile(`candidates/${candidate}.mjs`, 'utf8');
  const executor = await createExecutor('createos', code, (type, data) => console.log(data.message));
  try {
    for (let i = 1; i <= 10; i++) {
      const plan = makePlan(`S${String(i).padStart(2, '0')}`);
      const result = checkEvidence(plan, await executor.scenario(plan));
      console.log(`${candidate} ${plan.id}: ${result.status}`);
      results.push({ candidate, ...result });
      if (candidate === 'reference' && result.status !== 'passed') throw new Error(`${plan.id} failed: ${JSON.stringify(result.assertions.filter(x => !x.passed))}\n${result.stderr}\n${JSON.stringify(result.checkpoints.map(x => x.results))}`);
    }
  } finally { await executor.close(); }
}
await fs.mkdir('.rehearsal', { recursive: true });
await fs.writeFile('.rehearsal/cloud-verification.json', JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2));
console.log('CreateOS verification complete: all ten reference scenarios passed.');
