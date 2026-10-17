import dotenv from'dotenv';dotenv.config({quiet:true});
import{startWorkspaceMonitor}from'../server/cart/sandbox.mjs';
const x=await startWorkspaceMonitor((t,m)=>console.log(t+': '+m));
console.log(JSON.stringify(x));
for(let i=0;i<12;i++){try{const r=await fetch(x.url,{signal:AbortSignal.timeout(5000)});if(r.ok&&(await r.text()).includes('CartPilot')){console.log('Public microVM ingress verified: HTTP 200.');process.exit(0);}}catch{}await new Promise(r=>setTimeout(r,1000));}
throw Error('The monitor ingress is not reachable yet.');
