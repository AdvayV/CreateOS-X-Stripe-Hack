import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@nodeops-createos/sandbox';
import { createHash } from 'node:crypto';
const stateFile=path.resolve('.rehearsal/cart-sandbox.json');
let pool=null;let lock=Promise.resolve();
const idleEgress=()=>process.env.CARTPILOT_SELF_HOSTED==='true'?['api.sb.createos.sh:443']:['rehearsal.invalid:443'];
const allowEgress=rules=>process.env.CARTPILOT_SELF_HOSTED==='true'?[...new Set([...rules,'api.sb.createos.sh:443'])]:rules;
const client=()=>createClient({apiKey:process.env.CREATEOS_SANDBOX_API_KEY||process.env.CREATEOS_PROJECT_API_KEY||process.env.CREATEOS_API_KEY,baseUrl:process.env.CREATEOS_SANDBOX_BASE_URL||'https://api.sb.createos.sh',timeoutMs:60000,retry:false});
export async function readPlannerMemory(){return serial(async()=>{const box=await getPool(()=>{});try{const bytes=await box.files.download('/tmp/cartpilot/planner-memory.json');const x=JSON.parse(new TextDecoder().decode(bytes));return x.source==='ai-generated'&&typeof x.code==='string'?x:null;}catch{return null;}});}
export async function savePlannerMemory(result){return serial(async()=>{const box=await getPool(()=>{});await box.files.upload('/tmp/cartpilot/planner-memory.json',JSON.stringify({...result,generatedAt:new Date().toISOString()}));await box.runCommand('chmod',['600','/tmp/cartpilot/planner-memory.json']);});}
export async function observeStorefronts(origin,jobId,emit){return serial(async()=>{
  const url=new URL(origin);if(url.protocol!=='https:'||!url.hostname.endsWith('.tyzo.nodeops.app')&&!url.hostname.endsWith('.app.sb.createos.sh'))throw Error('Browser observation is restricted to the configured CreateOS demo host.');
  const box=await getPool(emit),base=`/tmp/cartpilot/browser-${jobId}`;await box.runCommand('mkdir',['-p',base]);await box.files.upload(base+'/observe.py',await fs.readFile('shop/observe.py','utf8'));
  const browserOrigin=process.env.CARTPILOT_SELF_HOSTED==='true'?'http://127.0.0.1:4173':origin;
  await box.setEgress(allowEgress([url.hostname+':443','fonts.googleapis.com:443','fonts.gstatic.com:443']));
  try{emit('browser','Chromium is opening the three public demo merchant storefronts.');const{result}=await box.runCommand('timeout',['95','python3','-I',base+'/observe.py',browserOrigin,base+'/observed.json'],{timeoutMs:105000});if(result.exit_code!==0)throw Error('Browser observation failed: '+(result.stderr||result.stdout).slice(-1200));const bytes=await box.files.download(base+'/observed.json');const observed=JSON.parse(new TextDecoder().decode(bytes));if(observed.offers.length!==108)throw Error('The browser did not observe all 108 demo merchant offers.');await fs.mkdir(path.resolve('.rehearsal/cart-images',jobId),{recursive:true});for(const merchant of ['flash','fresh','corner']){const image=await box.files.download(base+'/observed.json.'+merchant+'.png');await fs.writeFile(path.resolve('.rehearsal/cart-images',jobId,merchant+'.png'),Buffer.from(image));}emit('browser','Observed 108 offers across three real browser pages. Screenshots were downloaded as evidence.');return{offers:observed.offers,screenshots:['flash','fresh','corner'].map(id=>({merchantId:id,url:`/api/shop/jobs/${jobId}/browser/${id}`})),source:'Playwright Chromium in CreateOS',status:'verified'};}finally{await box.setEgress(idleEgress());}
});}
export function configured(){return !!(process.env.CREATEOS_SANDBOX_API_KEY||process.env.CREATEOS_PROJECT_API_KEY||process.env.CREATEOS_API_KEY);}
export async function reserveAiBudget(){return serial(async()=>{const box=await getPool(()=>{});const code="import json,fcntl,os; p='/tmp/cartpilot/ai-meter.json'; f=open(p,'a+'); fcntl.flock(f,fcntl.LOCK_EX); f.seek(0); raw=f.read(); d=json.loads(raw) if raw else {'reservedCents':0,'calls':0}; ok=d['reservedCents']+10<=200; d.update(reservedCents=d['reservedCents']+(10 if ok else 0),calls=d['calls']+(1 if ok else 0)); f.seek(0); f.truncate(); json.dump(d,f); f.flush(); os.fsync(f.fileno()); print(json.dumps({'approved':ok,**d})); f.close()";const{result}=await box.runCommand('python3',['-I','-c',code]);if(result.exit_code!==0)throw Error('Cannot verify the shared AI spending allowance.');const budget=JSON.parse(result.stdout);if(!budget.approved)throw Error('The shared $2 AI allowance is exhausted. No further AI call was made.');return budget;});}
async function serial(work){let unlock;const next=new Promise(r=>unlock=r);const before=lock;lock=next;await before;try{return await work();}finally{unlock();}}
async function getPool(emit){
  if(!configured())throw new Error('CreateOS credentials are missing.');
  if(!pool){let id=process.env.CARTPILOT_SANDBOX_ID;try{id||=JSON.parse(await fs.readFile(stateFile,'utf8')).id;}catch{}
    if(id){try{pool=await client().getSandbox(id);}catch(error){if(error.status!==404&&error.statusCode!==404&&!/not found/i.test(error.message))throw error;}}
    if(!pool){emit('sandbox','Creating CartPilot’s persistent microVM.');pool=await client().createSandbox({name:`cartpilot-${Date.now().toString(36)}`,shape:'s-1vcpu-1gb',rootfs:'devbox:1',ingress_enabled:true,auto_pause_after_seconds:300,egress:['rehearsal.invalid:443']});await fs.mkdir(path.dirname(stateFile),{recursive:true});await fs.writeFile(stateFile,JSON.stringify({id:pool.id,createdAt:new Date().toISOString()}));}
  }
  await pool.refresh();
  if(pool.status==='pausing')await pool.waitUntilPaused({timeoutMs:180000});
  if(pool.status==='paused'){emit('resume','Resuming the saved microVM, including its filesystem state.');await pool.resume();}
  if(pool.status==='resuming'||pool.status==='creating')await pool.waitUntilRunning({timeoutMs:180000});
  if(pool.status!=='running')throw new Error(`Sandbox is ${pool.status}; wait and retry.`);
  await pool.runCommand('mkdir',['-p','/tmp/cartpilot/public']);
  return pool;
}
export async function executePlanner(code,input,jobId,emit){return serial(async()=>{
  const box=await getPool(emit),base=`/tmp/cartpilot/${jobId}`;
  if(!/^[a-f0-9-]+$/.test(jobId))throw new Error('Invalid execution namespace.');
  const user='cp'+createHash('sha256').update(jobId).digest('hex').slice(0,10);
  const exists=await box.runCommand('id',['-u',user]);
  if(exists.result.exit_code!==0){await box.runCommand('mkdir',['-p','/tmp/cartpilot/users']);const created=await box.runCommand('useradd',['--system','--create-home','--home-dir',`/tmp/cartpilot/users/${user}`,user]);if(created.result.exit_code!==0)throw Error('Could not isolate the execution user.');}
  await box.runCommand('mkdir',['-p',base]);
  await box.runCommand('chown',[`${user}:${user}`,base]);await box.runCommand('chmod',['700',base]);
  await box.files.upload(`${base}/planner.py`,code);await box.files.upload(`${base}/input.json`,JSON.stringify(input));
  emit('transfer','Uploaded generated Python and a sanitized merchant catalog.');
  const{result}=await box.runCommand('runuser',['-u',user,'--','timeout','30','/usr/bin/python3','-I',`${base}/planner.py`,`${base}/input.json`,`${base}/plan.json`],{timeoutMs:35000});
  emit('stdout',result.stdout.trim()||'(No stdout)');emit('exit',`Python process exited with code ${result.exit_code}.`);
  if(result.exit_code!==0)throw new Error(`Planner execution failed (exit ${result.exit_code}): ${(result.stdout+' '+result.stderr).slice(0,1500)}`);
  const artifact=await box.files.download(`${base}/plan.json`);if(artifact.byteLength>250000)throw new Error('Planner artifact exceeded the size limit.');
  const parsed=JSON.parse(new TextDecoder().decode(artifact));
  emit('artifact','Downloaded plan.json. Independent checks now verify prices, stock, fees and dietary rules.');
  return{result:parsed,execution:{engine:'createos',sandboxId:box.id,exitCode:result.exit_code,stdout:result.stdout,codeHash:createHash('sha256').update(code).digest('hex'),artifact:`${base}/plan.json`,features:['Code execution','File transfer','Restricted egress','Persistent state','Pause / resume','Managed processes','Public ingress']}};
});}
export async function generateWithSandboxAgent(prompt){return serial(async()=>{
  const box=await getPool(()=>{}),id=createHash('sha256').update(String(Date.now())+Math.random()).digest('hex').slice(0,10),user='cg'+id,dir='/tmp/cartpilot/generator/'+id;
  await box.runCommand('mkdir',['-p',dir,'/tmp/cartpilot/users']);
  const created=await box.runCommand('useradd',['--system','--create-home','--home-dir',`/tmp/cartpilot/users/${user}`,user]);if(created.result.exit_code!==0)throw Error('Could not isolate the coding-agent user.');
  await box.runCommand('chown',[`${user}:${user}`,dir]);await box.runCommand('chmod',['700',dir]);
  const binary='/tmp/cartpilot/toolchain/node_modules/opencode-linux-x64/bin/opencode';
  const installed=await box.runCommand('test',['-x',binary]);
  if(installed.result.exit_code!==0){
    await box.setEgress(allowEgress(['registry.npmjs.org:443','opencode.ai:443','*.opencode.ai:443','models.dev:443']));
    const install=await box.runCommand('npm',['install','--prefix','/tmp/cartpilot/toolchain','opencode-ai@1.18.34','--ignore-scripts'],{timeoutMs:100000});
    if(install.result.exit_code!==0){await box.setEgress(idleEgress());throw Error('The isolated agent installation failed: '+install.result.stderr.slice(-500));}
  }
  await box.setEgress(allowEgress(['opencode.ai:443','*.opencode.ai:443','models.dev:443']));
  try{
    const{result}=await box.runCommand('runuser',['-u',user,'--','timeout','180','sh','-c','cd "$1"; shift; exec "$@"','sh',dir,binary,'run','--model','opencode/big-pickle','--format','json',prompt],{timeoutMs:200000});
    if(result.exit_code!==0)throw Error(`The sandbox coding agent exited ${result.exit_code}: `+(result.stderr||result.stdout).slice(0,1200));
    const events=result.stdout.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);
    const taskBytes=await box.files.download(dir+'/task.json'),codeBytes=await box.files.download(dir+'/planner.py');
    let parsed;try{parsed={task:JSON.parse(new TextDecoder().decode(taskBytes)),code:new TextDecoder().decode(codeBytes),summary:events.filter(e=>e.type==='text').map(e=>e.part?.text||'').join('\n').slice(-400)||'The sandbox coding agent wrote an executable merchant-comparison program.'};}catch{throw Error('The sandbox coding agent produced invalid files.');}
    if(typeof parsed.code!=='string'||parsed.code.length>30000||!parsed.task)throw Error('The sandbox coding agent returned an invalid program.');
    return{...parsed,model:'OpenCode / Big Pickle (free)',source:'ai-generated',usage:events.filter(e=>e.type==='step_finish').map(e=>e.part?.tokens),providerCostUsd:events.filter(e=>e.type==='step_finish').reduce((s,e)=>s+(e.part?.cost||0),0)};
  }finally{await box.setEgress(idleEgress());}
});}
export async function pauseWorkspace(emit){
  if(process.env.CARTPILOT_PAUSE_ON_APPROVAL!=='true'){emit('idle','Workspace retained for rapid recovery; CreateOS will auto-pause after five minutes of inactivity.');return;}
  return serial(async()=>{if(!pool)return;await pool.refresh();if(pool.status==='running'){await pool.pause();emit('snapshot','CreateOS accepted the snapshot request. The basket does not need to wait for resource optimization.');}});
}
export async function resumeWorkspace(emit){return serial(async()=>{const box=await getPool(emit);return{id:box.id,status:box.status};});}
export async function workspaceStatus(){try{let id=pool?.id||process.env.CARTPILOT_SANDBOX_ID;if(!id){try{id=JSON.parse(await fs.readFile(stateFile,'utf8')).id;}catch{}}if(!id)return{configured:configured(),status:'not-created'};const box=await client().getSandbox(id);return{configured:true,id:box.id,status:box.status,url:box.previewUrl(8081)};}catch{return{configured:configured(),status:'unavailable'};}}
export async function startWorkspaceMonitor(emit){return serial(async()=>{const box=await getPool(emit);await box.files.upload('/tmp/cartpilot/public/index.html',`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>CartPilot · CreateOS workspace</title><style>body{margin:0;background:#102b28;color:#edf8da;font:16px system-ui;padding:8vw}small{color:#bcda8b;letter-spacing:3px}h1{font-size:64px;letter-spacing:-3px}p{color:#a9c2b5;max-width:600px;line-height:1.8}.pill{display:inline-block;padding:12px 18px;background:#21443b;border-radius:30px;margin:5px}</style></head><body><small>CARTPILOT / EXECUTION WORKSPACE</small><h1>Your errands.<br>Your rules.</h1><p>This is the actual CreateOS microVM used by CartPilot. Generated Python, merchant comparison and saved planning artifacts execute here. No private cart details or credentials are published on this monitor.</p><span class="pill">1 vCPU / 1 GB</span><span class="pill">Persistent workspace</span><span class="pill">Managed HTTP process</span></body></html>`);
    const processes=await box.processes.list();let monitor=processes.processes?.find(p=>p.cmd==='python3'&&p.args?.includes('8081')&&!p.tree_exited);
    if(!monitor)monitor=await box.processes.create({cmd:'python3',args:['-m','http.server','8081','--bind','0.0.0.0','--directory','/tmp/cartpilot/public']});
    const value={id:box.id,processId:monitor.process_id,url:box.previewUrl(8081),status:box.status};emit('process',`Managed workspace monitor started: ${monitor.process_id}`);return value;
});}
