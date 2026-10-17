import dotenv from'dotenv';dotenv.config({quiet:true});import fs from'node:fs/promises';import path from'node:path';import{createClient}from'@nodeops-createos/sandbox';
const{id}=JSON.parse(await fs.readFile('.rehearsal/cart-sandbox.json','utf8'));
const box=await createClient({apiKey:process.env.CREATEOS_PROJECT_API_KEY,retry:false}).getSandbox(id);
if(box.status==='pausing')await box.waitUntilPaused({timeoutMs:240000});if(box.status==='paused')await box.resume();await box.waitUntilRunning({timeoutMs:180000});
const root='/tmp/cartpilot/app',origin=box.previewUrl(4173);await box.runCommand('mkdir',['-p',root]);await box.runCommand('chmod',['700',root]);
async function upload(name){const local=path.resolve(name),remote=root+'/'+name.split(path.sep).join('/');const stat=await fs.stat(local);if(stat.isDirectory()){await box.runCommand('mkdir',['-p',remote]);for(const file of await fs.readdir(local))await upload(path.join(name,file));}else await box.files.upload(remote,new Uint8Array(await fs.readFile(local)));}
for(const file of ['package.json','package-lock.json','dist','server','shop'])await upload(file);
const settings={CREATEOS_SANDBOX_API_KEY:process.env.CREATEOS_PROJECT_API_KEY,CARTPILOT_SANDBOX_ID:id,CARTPILOT_AI_ENABLED:'true',CARTPILOT_AI_PROVIDER:'sandbox',CARTPILOT_BROWSER_OBSERVE:'true',CARTPILOT_SELF_HOSTED:'true',PUBLIC_ORIGIN:origin,PUBLIC_DEMO:'true',HOST:'0.0.0.0',PORT:'4173'};
await box.files.upload(root+'/.runtime-settings.json',JSON.stringify(settings));await box.runCommand('chmod',['600',root+'/.runtime-settings.json']);
await box.files.upload(root+'/launch.mjs',"import fs from'node:fs';Object.assign(process.env,JSON.parse(fs.readFileSync('.runtime-settings.json','utf8')));await import('./server/cart-server.mjs');");
await box.setEgress(['registry.npmjs.org:443','api.sb.createos.sh:443']);
try{const{result}=await box.runCommand('sh',['-c','cd "$1" && npm ci --ignore-scripts','sh',root],{timeoutMs:120000});if(result.exit_code!==0)throw Error('Application dependencies failed: '+result.stderr.slice(-800));console.log('Application dependencies installed.');}finally{await box.setEgress(['api.sb.createos.sh:443']);}
const existing=await box.processes.list();for(const p of existing.processes||[])if(p.cwd===root&&!p.tree_exited)await box.processes.delete(p.process_id);
const p=await box.processes.create({cmd:'node',args:['launch.mjs'],cwd:root});console.log(JSON.stringify({processId:p.process_id,url:origin}));
for(let i=0;i<15;i++){try{const r=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(5000)});if(r.ok){console.log('Current CartPilot sandbox deployment verified: HTTP 200.');await fs.writeFile('.rehearsal/cart-preview.json',JSON.stringify({origin,processId:p.process_id}));process.exit(0);}}catch{}await new Promise(r=>setTimeout(r,1000));}
throw Error('Application ingress is not ready yet.');
