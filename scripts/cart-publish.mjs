import dotenv from'dotenv';dotenv.config({quiet:true});
const endpoint='https://api-createos.nodeops.network/mcp';let session;
async function call(method,params){const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream','X-Api-Key':process.env.CREATEOS_PROJECT_API_KEY};if(session)headers['Mcp-Session-Id']=session;const r=await fetch(endpoint,{method:'POST',headers,signal:AbortSignal.timeout(30000),body:JSON.stringify({jsonrpc:'2.0',id:method,method,params})});session=r.headers.get('mcp-session-id')||session;const text=await r.text();if(!r.ok)throw Error(`MCP HTTP ${r.status}`);try{return JSON.parse(text);}catch{return JSON.parse(text.split('\n').findLast(l=>l.startsWith('data: ')).slice(6));}}
await call('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'CartPilot publish',version:'1.0'}});
const deploymentId=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(deploymentId||''))throw Error('Pass the verified deployment ID.');
const x=await call('tools/call',{name:'AssignDeploymentToProjectEnvironment',arguments:{project_id:'c57592e3-ea17-4eb8-943b-cfb01c12d708',environment_id:'22468ce9-4db0-4c86-b3fa-277bf0814d52',body:{deploymentId}}});
if(x.error||x.result?.isError)throw Error(JSON.stringify(x.error||x.result));
console.log('Deployment assignment completed.');
const e=await call('tools/call',{name:'ListProjectEnvironments',arguments:{project_id:'c57592e3-ea17-4eb8-943b-cfb01c12d708'}});
for(const c of e.result?.content||[]){if(c.type==='text'){try{const data=JSON.parse(c.text);console.log(JSON.stringify(data.data?.map(v=>({id:v.id,name:v.displayName,deployment:v.projectDeploymentId,endpoint:v.extra?.endpoint}))));}catch{}}}
