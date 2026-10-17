import dotenv from'dotenv';dotenv.config({quiet:true});import fs from'node:fs/promises';import{createClient}from'@nodeops-createos/sandbox';
const{id}=JSON.parse(await fs.readFile('.rehearsal/cart-sandbox.json','utf8'));const box=await createClient({apiKey:process.env.CREATEOS_PROJECT_API_KEY,retry:false}).getSandbox(id);
if(box.status!=='running')throw Error('Wait until the workspace is running.');
await box.setEgress(['deb.debian.org:80','deb.debian.org:443','security.debian.org:80','security.debian.org:443','archive.ubuntu.com:80','security.ubuntu.com:80']);
try{const{result}=await box.runCommand('python3',['-m','playwright','install-deps','chromium'],{timeoutMs:180000});console.log(JSON.stringify(result));process.exitCode=result.exit_code;}finally{await box.setEgress(['rehearsal.invalid:443']);}
process.exit(process.exitCode||0);
