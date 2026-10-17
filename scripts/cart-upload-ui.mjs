import dotenv from'dotenv';dotenv.config({quiet:true});
import fs from'node:fs/promises';import path from'node:path';import{createClient}from'@nodeops-createos/sandbox';
const{id}=JSON.parse(await fs.readFile('.rehearsal/cart-sandbox.json','utf8'));
const box=await createClient({apiKey:process.env.CREATEOS_PROJECT_API_KEY,retry:false}).getSandbox(id);
console.log('Sandbox status: '+box.status);
if(box.status==='pausing')await box.waitUntilPaused({timeoutMs:240000});
if(box.status==='paused')await box.resume();await box.waitUntilRunning({timeoutMs:180000});
async function upload(name){const local=path.join('dist',name),remote='/tmp/cartpilot/app/dist/'+name.split(path.sep).join('/');if((await fs.stat(local)).isDirectory()){await box.runCommand('mkdir',['-p',remote]);for(const file of await fs.readdir(local))await upload(path.join(name,file));}else await box.files.upload(remote,new Uint8Array(await fs.readFile(local)));}
// Publish the entry point last so it only references assets already uploaded.
for(const file of await fs.readdir('dist'))if(file!=='index.html')await upload(file);
await upload('index.html');console.log('Updated frontend published without restarting the app.');
process.exit(0);
