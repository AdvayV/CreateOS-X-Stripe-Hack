import test from'node:test';import assert from'node:assert/strict';
import{api}from'../src/api.mjs';
const waking=()=>new Response('Sandbox is waking up. Retry in a moment.',{status:503});
test('Read recovers from the plain-text sandbox wake response',async()=>{
  let calls=0;const result=await api('/api/health',undefined,{fetchImpl:async()=>++calls===1?waking():Response.json({ok:true}),wait:async()=>{}});
  assert.equal(result.ok,true);assert.equal(calls,2);
});
test('Wake retries are bounded and show a readable error',async()=>{
  let calls=0;await assert.rejects(api('/api/health',undefined,{fetchImpl:async()=>{calls++;return waking();},wait:async()=>{}}),/sandbox is waking up/);assert.equal(calls,3);
});
test('Checkout POST is never replayed after a wake response',async()=>{
  let calls=0;await assert.rejects(api('/checkout',{}, {fetchImpl:async()=>{calls++;return waking();},wait:async()=>{}}),/sandbox is waking up/);assert.equal(calls,1);
});
test('HTML gateway failures do not leak JSON parse errors',async()=>{
  await assert.rejects(api('/api/health',undefined,{fetchImpl:async()=>new Response('<html>Bad gateway</html>',{status:502})}),/unexpected server response \(HTTP 502\)/);
});
test('Application JSON errors preserve their useful message',async()=>{
  await assert.rejects(api('/checkout',{}, {fetchImpl:async()=>Response.json({error:'Approval expired.'},{status:400})}),/Approval expired/);
});
