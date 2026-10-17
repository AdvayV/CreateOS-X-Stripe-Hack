import './build-runtime.mjs';
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['--use-system-ca', '--use-env-proxy', 'server/index.mjs', '--dev'], { stdio: 'inherit', env: process.env });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', code => { process.exitCode = code ?? 0; });
