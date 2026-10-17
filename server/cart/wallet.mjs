import {execFile} from 'node:child_process';import{promisify}from'node:util';import path from'node:path';
const exec=promisify(execFile);
async function link(args){const{stdout}=await exec(process.execPath,[path.resolve('node_modules/@stripe/link-cli/dist/cli.js'),...args,'--format','json'],{timeout:30000,maxBuffer:300000,windowsHide:true,env:process.env});const parsed=JSON.parse(stdout);return Array.isArray(parsed)?parsed.at(-1)?.data??parsed.at(-1):parsed.data??parsed;}
const clean=x=>({id:x.id,status:x.status,amount:x.amount,currency:x.currency,approvalUrl:x.approval_url??x.approvalUrl??null,testMode:true});
export async function createLinkApproval(job,baseUrl){
  const q=job.quote;
  const result=await link(['spend-request','create','--test','--amount',String(q.total),'--currency','usd','--merchant-name',`${q.merchant.name} · CartPilot demo`,'--merchant-url',baseUrl,'--context',`CartPilot is requesting approval for a simulated quick-commerce grocery basket from ${q.merchant.name}. This is a test-mode purchase study; no real grocery order will be placed. Basket reference ${job.id}.`,'--idempotency-key',`cartpilot-${job.id}-${q.digest.slice(0,16)}`,'--no-request-approval']);
  if(!result.id)throw new Error('Link did not return a spend request. Complete buyer authorization first.');
  const requested=await link(['spend-request','request-approval',result.id]);return clean({...result,...requested});
}
export async function linkApprovalStatus(id){if(!/^lsrq_[A-Za-z0-9]+$/.test(id))throw new Error('Invalid Link spend request ID.');return clean(await link(['spend-request','retrieve',id]));}
