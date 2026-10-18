import test from'node:test';import assert from'node:assert/strict';
import{activePlanningReply,interruptPlanningJob}from'../server/cart/planning.mjs';
test('Repeated plan requests reattach to the same browser session',()=>{
  assert.deepEqual(activePlanningReply({id:'job-one',sessionId:'alice'},'alice'),{status:202,body:{id:'job-one',resumed:true}});
});
test('Another session cannot discover the active job ID',()=>{
  const reply=activePlanningReply({id:'private-job',sessionId:'alice'},'bob');assert.equal(reply.status,409);assert.equal(JSON.stringify(reply).includes('private-job'),false);
});
test('Restart recovery only interrupts unfinished planning jobs',()=>{
  const job={status:'executing',events:[]};assert.equal(interruptPlanningJob(job),true);assert.equal(job.status,'error');assert.match(job.error,/interrupted/);
  for(const status of ['ordered','approved','awaiting_approval','payment_pending','fulfilling']){const saved={status,events:[]};assert.equal(interruptPlanningJob(saved),false);assert.equal(saved.status,status);}
});
