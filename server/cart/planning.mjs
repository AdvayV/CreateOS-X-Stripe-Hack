export function activePlanningReply(active,sessionId){
  if(!active)return null;
  if(active.sessionId===sessionId)return{status:202,body:{id:active.id,resumed:true}};
  return{status:409,body:{error:'The shared demo workspace is completing a planning run. Please try again shortly.'}};
}
export function interruptPlanningJob(job){
  if(!['planning','executing','verifying'].includes(job.status))return false;
  job.status='error';job.error='The previous planning run was interrupted. Please start a new basket.';
  job.events.push({id:job.events.length,type:'error',message:job.error,at:new Date().toISOString()});
  return true;
}
