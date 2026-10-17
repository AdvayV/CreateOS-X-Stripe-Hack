import dotenv from 'dotenv';
dotenv.config({quiet:true});dotenv.config({path:'.env.app',quiet:true});
import {execFile} from 'node:child_process';import{promisify}from'node:util';
import {commerceStatus}from'../server/commerce.mjs';
import {workspaceStatus}from'../server/cart/sandbox.mjs';
const exec=promisify(execFile);
try{
  const {stdout}=await exec(process.execPath,['--use-system-ca','--use-env-proxy','node_modules/@stripe/link-cli/dist/cli.js','auth','status','--interval','2','--max-attempts','3','--format','json'],{timeout:20000,windowsHide:true});
  const rows=JSON.parse(stdout);const x=Array.isArray(rows)?rows.at(-1):rows;
  console.log(JSON.stringify({linkAuthenticated:x.authenticated===true,pending:!!x.pending,verificationUrl:x.verification_url??null}));
}catch{console.log('Link status could not be confirmed.');}
const s=commerceStatus();console.log(JSON.stringify({stripeTestReady:s.ready,missing:s.missing}));
console.log(JSON.stringify(await workspaceStatus()));
if(process.argv.includes('--job')){const{DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync('.rehearsal/cartpilot.db');const row=db.prepare('SELECT payload FROM jobs ORDER BY created_at DESC LIMIT 1').get();if(row){const j=JSON.parse(row.payload);console.log(JSON.stringify({id:j.id,status:j.status,error:j.error,events:j.events.slice(-8)}));}db.close();}
process.exit(0);
