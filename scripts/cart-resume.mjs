import dotenv from'dotenv';dotenv.config({quiet:true});
import{resumeWorkspace}from'../server/cart/sandbox.mjs';
const box=await resumeWorkspace((t,m)=>console.log(t+': '+m));
console.log('Demo workspace '+box.status+': https://'+box.id.replace(/^sb-/,'')+'-4173.app.sb.createos.sh');
process.exit(0);
