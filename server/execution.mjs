import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@nodeops-createos/sandbox';
import { executePlan } from '../.runtime/runner.mjs';
import { executionPlan } from '../core/plans.mjs';
export const dataRoot = path.resolve('.rehearsal');
const approvalPath = path.join(dataRoot, 'approvals.json');
export async function approvals() { try { return JSON.parse(await fs.readFile(approvalPath, 'utf8')); } catch { return { createos: false, ai: false, cloudSecondsRemaining: 0 }; } }
export function cloudClient() {
  const apiKey = process.env.CREATEOS_SANDBOX_API_KEY || process.env.CREATEOS_PROJECT_API_KEY || process.env.CREATEOS_PLAN_API_KEY;
  if (!apiKey) throw new Error('CreateOS credentials are not configured. Run Stripe Projects env --pull.');
  return createClient({ apiKey, baseUrl: process.env.CREATEOS_SANDBOX_BASE_URL || 'https://api.sb.createos.sh', timeoutMs: 30000 });
}
export async function createExecutor(mode, code, emit) {
  const runId = randomUUID(), work = path.join(dataRoot, 'runs', runId);
  await fs.mkdir(work, { recursive: true });
  const candidatePath = path.join(work, 'candidate.mjs'); await fs.writeFile(candidatePath, code);
  if (mode === 'local') return { id: 'local-processes', mode, async scenario(plan) { return executePlan(executionPlan(plan), candidatePath, path.join(work, plan.id)); }, async close() {} };
  const permission = await approvals();
  if (!permission.createos || permission.cloudSecondsRemaining < 300) throw new Error('CreateOS execution needs approval or the local allowance is exhausted.');
  permission.cloudSecondsRemaining -= 300;
  await fs.writeFile(approvalPath, JSON.stringify(permission, null, 2));
  const reservedAt = Date.now();
  emit('log', { message: 'Creating isolated CreateOS microVM · 1 vCPU / 1 GB · devbox:1' });
  const sandbox = await cloudClient().createSandbox({ shape: 's-1vcpu-1gb', rootfs: 'devbox:1', name: `rehearsal-${runId.slice(0, 8)}`, auto_pause_after_seconds: 60, egress: ['rehearsal.invalid:443'] });
  let closed = false, closing;
  const close = () => { if (closing) return closing; closing = (async () => { try { await sandbox.destroy({ timeoutMs: 20000 }); closed = true; clearTimeout(deadline); const current = await approvals(); current.cloudSecondsRemaining += Math.max(0, 300 - Math.ceil((Date.now() - reservedAt) / 1000)); await fs.writeFile(approvalPath, JSON.stringify(current, null, 2)); emit('log', { message: 'Disposable CreateOS sandbox destroyed.' }); } catch (error) { closing = null; throw error; } })(); return closing; };
  const deadline = setTimeout(() => { void close().catch(e => emit('log', { message: `Cleanup needs attention: ${e.message}` })); }, 300000);
  try {
    const version = await sandbox.runCommand('node', ['--version']);
    emit('log', { message: `Sandbox runtime: ${version.result.stdout.trim()}` });
    const mkdir = await sandbox.runCommand('mkdir', ['-p', '/tmp/rehearsal/runtime']);
    if (mkdir.result.exit_code !== 0) throw new Error('Sandbox setup failed.');
    for (const [source, destination] of [['.runtime/worker.bundle.mjs', 'worker.bundle.mjs'], ['.runtime/runner.mjs', 'runner.mjs']]) await sandbox.files.upload(`/tmp/rehearsal/runtime/${destination}`, await fs.readFile(source));
    await sandbox.files.upload('/tmp/rehearsal/candidate.mjs', code);
  } catch (e) { await close(); throw e; }
  return { id: sandbox.id ?? sandbox.sandboxId ?? runId, mode,
    async scenario(plan) {
      if (closed) throw new Error('Sandbox execution deadline reached.');
      const input = { plan: executionPlan(plan), candidatePath: '/tmp/rehearsal/candidate.mjs', root: `/tmp/rehearsal/${plan.id}`, output: `/tmp/rehearsal/${plan.id}.evidence.json` };
      await sandbox.files.upload('/tmp/rehearsal/input.json', JSON.stringify(input));
      const { result } = await sandbox.runCommand('node', ['/tmp/rehearsal/runtime/runner.mjs', '--run', '/tmp/rehearsal/input.json'], { timeoutMs: 65000 });
      emit('log', { message: `${plan.id} · exit ${result.exit_code} · ${result.stdout.trim()}`, scenarioId: plan.id });
      if (result.exit_code !== 0) throw new Error(`Sandbox runner failed: ${String(result.stderr).slice(0, 1000)}`);
      const bytes = await sandbox.files.download(input.output);
      if (bytes.byteLength > 2_000_000) throw new Error('Evidence exceeded size limit.');
      const evidence = JSON.parse(new TextDecoder().decode(bytes)); evidence.exitCode = result.exit_code;
      await fs.writeFile(path.join(work, `${plan.id}.evidence.json`), JSON.stringify(evidence, null, 2));
      return evidence;
    }, close };
}
