import dotenv from'dotenv';dotenv.config({quiet:true});import fs from'node:fs/promises';import{execFile}from'node:child_process';import{promisify}from'node:util';
const project='c57592e3-ea17-4eb8-943b-cfb01c12d708',environment='22468ce9-4db0-4c86-b3fa-277bf0814d52';
const{id}=JSON.parse(await fs.readFile('.rehearsal/cart-sandbox.json','utf8'));
const settings={CREATEOS_SANDBOX_API_KEY:process.env.CREATEOS_PROJECT_API_KEY||process.env.CREATEOS_SANDBOX_API_KEY,CARTPILOT_SANDBOX_ID:id,CARTPILOT_AI_ENABLED:'true',CARTPILOT_AI_PROVIDER:'sandbox',CARTPILOT_BROWSER_OBSERVE:'true',PUBLIC_ORIGIN:'https://hackathon-cartpilot-advay.tyzo.nodeops.app',PUBLIC_DEMO:'true',HOST:'0.0.0.0',PORT:'4173'};
const file='.env.cartdeploy';await fs.writeFile(file,Object.entries(settings).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});
try{await promisify(execFile)('createos',['env','push','--file',file,'--project',project,'--environment',environment,'--force'],{timeout:30000,maxBuffer:300000,windowsHide:true});console.log('Runtime settings securely uploaded to the demo environment. Values were not logged.');}finally{await fs.unlink(file);}
