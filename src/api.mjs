const wakingMessage='The sandbox is waking up. Please wait a moment and try again.';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function api(url,body,{fetchImpl=globalThis.fetch,wait=sleep}={}){
  const readOnly=body===undefined;
  for(let attempt=0;attempt<3;attempt++){
    let response;
    try{
      response=await fetchImpl(url,{headers:{Accept:'application/json',...(readOnly?{}:{'Content-Type':'application/json'})},...(readOnly?{}:{method:'POST',body:JSON.stringify(body)})});
    }catch{
      throw Error('Could not reach CartPilot. Check your connection and try again.');
    }
    const text=await response.text();
    const waking=response.status===503&&/^Sandbox is\b/i.test(text.trim());
    if(waking){
      // Only reads may be replayed. A lost POST response does not prove it failed.
      if(readOnly&&attempt<2){await wait(2000);continue;}
      throw Error(wakingMessage);
    }
    let result;
    try{result=JSON.parse(text);}catch{
      throw Error(response.status===503?'CartPilot is temporarily unavailable. Please try again shortly.':`CartPilot received an unexpected server response (HTTP ${response.status}). Please try again.`);
    }
    if(!response.ok)throw Error(result.error||`Request failed (HTTP ${response.status}).`);
    return result;
  }
}
