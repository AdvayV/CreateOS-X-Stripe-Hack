import dotenv from'dotenv';dotenv.config({quiet:true});dotenv.config({path:'.env.app',quiet:true});
import http from'node:http';import fs from'node:fs/promises';import path from'node:path';import{DatabaseSync}from'node:sqlite';import{randomUUID,randomBytes,createHash}from'node:crypto';
import{catalog,CATEGORY_LABELS}from'../shop/catalog.mjs';import{verifyBasket,assertSpend}from'../shop/verify.mjs';
import{generateShoppingCode,aiStatus}from'./cart/ai.mjs';import{configured,executePlanner,pauseWorkspace,resumeWorkspace,workspaceStatus,startWorkspaceMonitor}from'./cart/sandbox.mjs';import{createLinkApproval,linkApprovalStatus}from'./cart/wallet.mjs';
import{commerceStatus,chargeTestRehearsal}from'./commerce.mjs';
import{requestOriginAllowed}from'./cart/origin.mjs';
import{observeStorefronts}from'./cart/sandbox.mjs';
await fs.mkdir('.rehearsal',{recursive:true});
const db=new DatabaseSync('.rehearsal/cartpilot.db');db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,created_at INTEGER,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS orders(intent TEXT PRIMARY KEY,session_id TEXT NOT NULL,payload TEXT NOT NULL)');
const port=Number(process.env.PORT||4173),root=path.resolve('dist');let planning=false;
let vite;if(process.argv.includes('--dev')){const{createServer}=await import('vite');vite=await createServer({server:{middlewareMode:true},appType:'spa'});}
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
async function body(req){let text='';for await(const c of req){text+=c;if(text.length>8000)throw Error('Request too large.');}return JSON.parse(text||'{}');}
function session(req,res){const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('cartpilot_sid='))?.split('=')[1];if(/^[a-f0-9]{48}$/.test(cookie||''))return cookie;const id=randomBytes(24).toString('hex');res.setHeader('Set-Cookie',`cartpilot_sid=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);return id;}
function save(job){db.prepare('INSERT INTO jobs(id,session_id,created_at,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(job.id,job.sessionId,job.createdAt,JSON.stringify(job));}
function read(id,sid){const row=db.prepare('SELECT payload FROM jobs WHERE id=? AND session_id=?').get(id,sid);if(!row)throw Error('Shopping session not found.');return JSON.parse(row.payload);}
function event(job,type,message){job.events.push({id:job.events.length,type,message,at:new Date().toISOString()});save(job);}
function safe(job){const{sessionId,overrides,...visible}=job;return visible;}
async function finishOrder(job,mode){const previous=db.prepare('SELECT payload FROM orders WHERE intent=? AND session_id=?').get(job.approval.id,job.sessionId);if(previous)return JSON.parse(previous.payload);job.status='fulfilling';save(job);const progress=[];await resumeWorkspace((t,m)=>progress.push([t,m]));for(const[t,m]of progress)event(job,t,m);job.receipt={id:`CP-${randomBytes(3).toString('hex').toUpperCase()}`,mode,paymentProvider:mode==='link-test'?'Link Agent Wallet + Stripe MPP · verified test payment':'Wallet policy simulator · not a Stripe/Link payment',merchant:job.quote.merchant.name,amount:job.quote.total,currency:'usd',items:job.quote.items.map(x=>({name:x.product.name,quantity:x.quantity,total:x.lineTotal})),intentId:job.approval.id,digest:job.quote.digest,createdAt:new Date().toISOString(),realOrder:false};db.prepare('INSERT OR IGNORE INTO orders VALUES(?,?,?)').run(job.approval.id,job.sessionId,JSON.stringify(job.receipt));job.status='ordered';event(job,'receipt',mode==='link-test'?'Stripe test payment verified. Demo order recorded once; no real groceries were ordered.':'Simulated grocery order recorded exactly once. No real merchant was contacted or charged.');await pauseWorkspace((t,m)=>event(job,t,m));save(job);return job.receipt;}
function referenceTask(request){const s=request.servings,text=request.prompt.toLowerCase();let categories=['snack','drink','sweet'];if(/breakfast|morning|brunch/.test(text))categories=['bread','dairy','fruit','coffee'];else if(/pasta|dinner|italian/.test(text))categories=['pantry','sauce','produce','drink'];else if(/healthy|salad|lunch/.test(text))categories=['produce','protein','fruit','drink'];else if(/essentials|restock|weekly/.test(text))categories=['bread','dairy','fruit','essential'];return{title:request.prompt.slice(0,65),servings:s,budgetCents:request.budgetCents,maxDeliveryMinutes:request.maxDeliveryMinutes,avoid:request.avoid,vegan:request.vegan,slots:categories.map(category=>({category,servings:s,label:CATEGORY_LABELS[category]}))};}
function normalizeTask(task,request){const cats=new Set(catalog().products.map(p=>p.category));return{...task,title:String(task.title||request.prompt).slice(0,65),servings:request.servings,budgetCents:request.budgetCents,maxDeliveryMinutes:request.maxDeliveryMinutes,avoid:[...new Set([...request.avoid,...(task.avoid||[])])].filter(x=>['peanut','tree_nut','milk','wheat','soy','egg','sesame'].includes(x)),vegan:request.vegan||!!task.vegan,slots:(task.slots||[]).filter(s=>cats.has(s.category)).slice(0,6).filter((s,i,a)=>a.findIndex(t=>t.category===s.category)===i).map(s=>({category:s.category,servings:request.servings,label:String(s.label).slice(0,50)}))};}
async function plan(job){planning=true;try{
  job.status='planning';job.approval=null;job.receipt=null;event(job,'understand',`Planning for ${job.request.servings} people with a $${(job.request.budgetCents/100).toFixed(2)} all-in spending limit.`);
  const data=catalog(job.overrides);let generated;
  if(process.env.CARTPILOT_BROWSER_OBSERVE==='true'&&process.env.PUBLIC_ORIGIN){try{job.browser=await observeStorefronts(process.env.PUBLIC_ORIGIN,job.id,(t,m)=>event(job,t,m));for(const offer of data.offers){const seen=job.browser.offers.find(x=>x.merchantId===offer.merchantId&&x.productId===offer.productId);if(!seen)throw Error('A merchant offer was missing from the browser observation.');if(!job.overrides[`${offer.merchantId}:${offer.productId}`]&&(seen.price!==offer.price||seen.stock!==offer.stock))throw Error('The browser and canonical merchant catalog disagree.');}event(job,'browser',job.revision?'Applied the injected inventory/price change to the browser-verified demo catalog.':'Browser prices and inventory match the canonical demo catalog.');}catch(error){job.browser={status:'unavailable',message:error.message};event(job,'browser-warning',error.message+' Continuing with the labeled API fixture snapshot.');}}
  if(job.request.planner==='ai'){event(job,'code','Loading the agent’s code memory, or writing a new Python merchant-comparison program.');generated=await generateShoppingCode(job.request,data);}
  else generated={task:referenceTask(job.request),code:await fs.readFile('shop/planner.py','utf8'),summary:'Bundled reference optimizer; no model call.',source:'reference'};
  job.task=normalizeTask(generated.task,job.request);if(!job.task.slots.length)throw Error('The request did not produce any supported product categories.');
  job.code=generated.code;job.plannerSource=generated.source;job.cachedCode=!!generated.cached;job.model=generated.model;job.summary=generated.summary;
  event(job,'code',generated.summary);job.status='executing';save(job);
  const input={...data,task:job.task};let execution;
  for(let attempt=0;attempt<2;attempt++){
    try{execution=await executePlanner(job.code,input,`${job.id}-${job.revision}-${attempt}`,(t,m)=>event(job,t,m));const candidates=execution.result.alternatives??[execution.result.best];job.comparison=candidates.map(c=>verifyBasket(c,input));job.quote=verifyBasket(execution.result.best,input);if(!job.quote.valid)throw Error('Independent validation failed: '+job.quote.checks.filter(c=>!c.passed).map(c=>`${c.name}: ${c.detail}`).join('; '));break;}
    catch(error){if(attempt||job.request.planner!=='ai')throw error;event(job,'repair','The first program failed. The agent is fixing its code using the execution error.');generated=await generateShoppingCode(job.request,data,error.message);job.code=generated.code;}
  }
  job.execution=execution.execution;job.quote.expiresAt=Date.now()+10*60000;job.checkoutToken=randomBytes(24).toString('hex');job.status='verifying';event(job,'compare',`${job.comparison.filter(x=>x.valid).length} feasible merchant baskets compared. ${job.quote.merchant.name} wins at $${(job.quote.total/100).toFixed(2)}, including every fee.`);
  event(job,'verify',`${job.quote.checks.length} independent basket checks passed. The agent cannot change these checks.`);
  await pauseWorkspace((t,m)=>event(job,t,m));job.status='awaiting_approval';event(job,'approval','Review the exact basket and approve its merchant, amount and contents before checkout.');
}catch(error){job.status='error';job.error=error.message;event(job,'error',error.message);try{await pauseWorkspace((t,m)=>event(job,t,m));}catch{}}
finally{planning=false;save(job);}}
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),sid=session(req,res);
  if(req.method==='POST'&&!requestOriginAllowed(req.headers,process.env.PUBLIC_ORIGIN))return send(res,403,{error:'Request origin is not allowed.'});
  if(url.pathname==='/api/health')return send(res,200,{ok:true,product:'CartPilot',realPurchases:false});
  if(url.pathname==='/api/shop/bootstrap')return send(res,200,{...catalog(),categories:CATEGORY_LABELS,createos:configured(),ai:{configured:(process.env.CARTPILOT_AI_PROVIDER||'sandbox')==='sandbox'?configured():!!process.env.OPENAI_API_KEY,...await aiStatus()},wallet:{mode:'simulation',linkAvailable:process.env.PUBLIC_DEMO!=='true'&&process.env.CARTPILOT_LINK_ENABLED==='true',mppReady:commerceStatus().ready,realPurchases:false},study:'Blinkit-inspired quick-commerce study. Fictional merchants, demo prices and delivery estimates. No Blinkit affiliation or live ordering.'});
  if(url.pathname==='/api/shop/workspace')return send(res,200,await workspaceStatus());
  if(url.pathname==='/api/shop/workspace/monitor'&&req.method==='POST'){if(process.env.PUBLIC_DEMO==='true')return send(res,403,{error:'Workspace administration is available to the local operator only.'});return send(res,200,await startWorkspaceMonitor(()=>{}));}
  if(url.pathname==='/api/shop/plan'&&req.method==='POST'){
    if(planning)return send(res,409,{error:'Another agent is using the shared workspace. Try again shortly.'});
    const b=await body(req),recent=db.prepare('SELECT count(*) as n FROM jobs WHERE session_id=? AND created_at>?').get(sid,Date.now()-15*60000).n;
    if(recent>=8)return send(res,429,{error:'This demo session has reached its planning limit. Use an existing basket or try later.'});
    const request={prompt:String(b.prompt||'Movie night for four').trim().slice(0,600),budgetCents:Number(b.budgetCents??3500),servings:Number(b.servings??4),maxDeliveryMinutes:Number(b.maxDeliveryMinutes??25),avoid:Array.isArray(b.avoid)?b.avoid.filter(x=>['peanut','tree_nut','milk','wheat','soy','egg','sesame'].includes(x)):[],vegan:!!b.vegan,planner:b.planner==='reference'?'reference':'ai',freshCode:b.planner==='fresh'};
    if(/peanut[- ]free|no peanuts|without peanuts/i.test(request.prompt))request.avoid.push('peanut');if(/dairy[- ]free|no dairy|without dairy/i.test(request.prompt))request.avoid.push('milk');if(/gluten[- ]free|no wheat|without wheat/i.test(request.prompt))request.avoid.push('wheat');if(/\bvegan\b/i.test(request.prompt))request.vegan=true;request.avoid=[...new Set(request.avoid)];
    if(!Number.isSafeInteger(request.budgetCents)||request.budgetCents<500||request.budgetCents>15000||!Number.isSafeInteger(request.servings)||request.servings<1||request.servings>12||!Number.isSafeInteger(request.maxDeliveryMinutes)||request.maxDeliveryMinutes<10||request.maxDeliveryMinutes>60)throw Error('Choose a $5–$150 budget, 1–12 people, and 10–60 minute delivery window.');
    const job={id:randomUUID(),sessionId:sid,createdAt:Date.now(),revision:0,request,events:[],overrides:{},status:'planning',quote:null,approval:null};save(job);send(res,202,{id:job.id});void plan(job);return;
  }
  const pay=url.pathname.match(/^\/api\/shop\/jobs\/([a-f0-9-]+)\/pay$/);
  if(pay&&req.method==='POST'){
    const b=await body(req),row=db.prepare('SELECT payload FROM jobs WHERE id=?').get(pay[1]);if(!row)return send(res,404,{error:'Quote not found.'});const job=JSON.parse(row.payload);
    if(b.quoteToken!==job.checkoutToken)return send(res,403,{error:'The payment capability does not match this quote.'});
    if(job.status==='ordered')return send(res,200,job.receipt);
    if(job.status!=='awaiting_approval'||job.quote.expiresAt<Date.now())return send(res,409,{error:'This quote is no longer payable. Replan and request approval again.'});
    const current=verifyBasket({merchantId:job.quote.merchant.id,items:job.quote.items.map(x=>({productId:x.productId,quantity:x.quantity}))},{...catalog(job.overrides),task:job.task});
    if(!current.valid||current.digest!==job.quote.digest)return send(res,409,{error:'Merchant price or inventory changed. No payment was attempted.'});
    job.status='payment_pending';save(job);let payment;try{payment=await chargeTestRehearsal(req,b,port,current.total);}catch(error){job.status='awaiting_approval';save(job);throw error;}job.status='awaiting_approval';save(job);if(payment.error)return send(res,payment.status,{error:payment.error});if(payment.challenge){res.writeHead(payment.challenge.status,Object.fromEntries(payment.challenge.headers));res.end(await payment.challenge.text());return;}
    job.approval={id:`link_${job.id}_${job.quote.digest.slice(0,10)}`,mode:'link-test',digest:job.quote.digest,amount:job.quote.total,budget:job.request.budgetCents,expiresAt:Date.now()+5*60000};save(job);const receipt=await finishOrder(job,'link-test');const response=payment.withReceipt(Response.json(receipt));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  const screenshot=url.pathname.match(/^\/api\/shop\/jobs\/([a-f0-9-]+)\/browser\/(flash|fresh|corner)$/);
  if(screenshot){read(screenshot[1],sid);const image=await fs.readFile(path.resolve('.rehearsal/cart-images',screenshot[1],screenshot[2]+'.png'));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'private, max-age=600'});res.end(image);return;}
  const match=url.pathname.match(/^\/api\/shop\/jobs\/([a-f0-9-]+)(?:\/(approve|checkout|fault|replan|link|report))?$/);
  if(match){const job=read(match[1],sid),action=match[2];
    if(!action)return send(res,200,safe(job));
    if(action==='report'){res.setHeader('Content-Disposition',`attachment; filename="cartpilot-${job.id.slice(0,8)}.json"`);return send(res,200,safe(job));}
    if(req.method!=='POST')return send(res,405,{error:'Use POST for this action.'});const b=await body(req);
    if(action==='approve'){
      if(job.status!=='awaiting_approval')throw Error('The current basket is not ready for approval.');
      if(job.quote.expiresAt<Date.now())throw Error('Quote expired. Replan before approving.');
      job.approval={digest:job.quote.digest,amount:job.quote.total,budget:job.request.budgetCents,expiresAt:Date.now()+5*60000,mode:'simulation',id:`demo_${randomUUID()}`};job.status='approved';event(job,'wallet',`Demo approval bound to ${job.quote.merchant.name}, $${(job.quote.total/100).toFixed(2)} and cart ${job.quote.digest.slice(0,10)}. This is not a Link payment.`);return send(res,200,safe(job));
    }
    if(action==='fault'){
      if(!job.quote||!['awaiting_approval','approved','stale'].includes(job.status))throw Error('Only a pending basket can receive a demo fault.');const item=job.quote.items[0],key=`${job.quote.merchant.id}:${item.productId}`;
      if(b.type==='price')job.overrides[key]={price:item.unitPrice+500,stock:8};else job.overrides[key]={stock:0};job.status='stale';job.approval=null;job.revision++;
      event(job,'blocked',b.type==='price'?'A demo merchant increased a price by $5. The old approval is invalid.':'A selected item sold out. The old approval is invalid; no order was placed.');return send(res,200,safe(job));
    }
    if(action==='replan'){if(['ordered','fulfilling','payment_pending'].includes(job.status))throw Error('This order cannot be replanned. Start a new mission.');if(planning)return send(res,409,{error:'The shared workspace is busy.'});job.revision++;job.error=null;save(job);send(res,202,{id:job.id});void plan(job);return;}
    if(action==='link'){
      if(process.env.PUBLIC_DEMO==='true'||process.env.CARTPILOT_LINK_ENABLED!=='true')throw Error('Link test wallet approval is available only to the connected local buyer.');
      if(b.refresh&&job.link){job.link=await linkApprovalStatus(job.link.id);event(job,'link',`Link test spend request is ${job.link.status}. Approval is not payment settlement.`);return send(res,200,safe(job));}
      if(job.status!=='awaiting_approval')throw Error('Review a fresh basket before requesting Link approval.');
      job.link=await createLinkApproval(job,process.env.PUBLIC_ORIGIN||`http://localhost:${port}`);event(job,'link','Link test approval requested. No payment credential is exposed to the agent.');return send(res,200,safe(job));
    }
    if(action==='checkout'){
      if(job.status==='ordered'){const prior=db.prepare('SELECT payload FROM orders WHERE intent=? AND session_id=?').get(job.approval?.id,sid);if(prior)return send(res,200,JSON.parse(prior.payload));}
      if(job.status!=='approved')throw Error('The basket is not approved for checkout.');
      const current=verifyBasket({merchantId:job.quote?.merchant.id,items:job.quote?.items.map(x=>({productId:x.productId,quantity:x.quantity}))}, {...catalog(job.overrides),task:job.task});
      assertSpend(current,job.approval);if(!current.valid)throw Error('The basket no longer passes its independent checks. Replan.');
      if(job.approval.mode!=='simulation')throw Error('A verified test payment receipt is required for Link checkout.');
      return send(res,200,await finishOrder(job,'simulation'));
    }
  }
  if(url.pathname.startsWith('/api/'))return send(res,404,{error:'Not found.'});
  if(vite)return vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});
  let filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!filename.startsWith(root+path.sep))filename=path.join(root,'index.html');
  let data;try{data=await fs.readFile(filename);}catch{filename=path.join(root,'index.html');data=await fs.readFile(filename);}
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(filename)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(data);
}catch(error){if(!res.headersSent)send(res,400,{error:error.message});else res.end();}});
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`CartPilot ready at http://localhost:${port}`));
