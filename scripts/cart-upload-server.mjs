import dotenv from'dotenv';dotenv.config({quiet:true});import fs from'node:fs/promises';import{createClient}from'@nodeops-createos/sandbox';
const{id}=JSON.parse(await fs.readFile('.rehearsal/cart-sandbox.json','utf8'));
const box=await createClient({apiKey:process.env.CREATEOS_PROJECT_API_KEY,retry:false}).getSandbox(id);
console.log('Sandbox status: '+box.status);
if(box.status==='pausing')await box.waitUntilPaused({timeoutMs:240000});
if(box.status==='paused')await box.resume();await box.waitUntilRunning({timeoutMs:180000});
const root='/tmp/cartpilot/app';
for(const file of ['server/cart/origin.mjs','server/cart/planning.mjs','server/cart-server.mjs'])await box.files.upload(root+'/'+file,new Uint8Array(await fs.readFile(file)));
const list=await box.processes.list();for(const p of list.processes||[])if(p.cwd===root&&!p.tree_exited)await box.processes.delete(p.process_id);
const p=await box.processes.create({cmd:'node',args:['launch.mjs'],cwd:root});console.log('Updated application process: '+p.process_id);
const origin=box.previewUrl(4173);
for(let attempt=0;attempt<15;attempt++){
  try{const health=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(5000)});if(health.ok){
    const route=origin+'/api/shop/jobs/00000000-0000-0000-0000-000000000000/approve';
    const post=site=>fetch(route,{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
    const good=await post(origin),bad=await post('https://attacker.example');
    const message=await good.json();
    if(good.status!==400||message.error!=='Shopping session not found.'||bad.status!==403)throw Error('Live origin regression check failed.');
    console.log('Verified public browser origin accepted; foreign origin rejected. No shopping mission or payment created.');process.exit(0);
  }}catch(error){if(error.message==='Live origin regression check failed.')throw error;}
  await new Promise(resolve=>setTimeout(resolve,1000));
}
throw Error('The updated app did not become ready.');
