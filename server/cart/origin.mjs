export function requestOriginAllowed(headers,publicOrigin){
  if(headers.origin===undefined)return true; // CLI clients do not send Origin.
  if(typeof headers.origin!=='string')return false;
  try{
    const origin=new URL(headers.origin);
    if(!['http:','https:'].includes(origin.protocol)||headers.origin!==origin.origin)return false;
    // Ingress may rewrite Host. Trust the configured public URL, never an
    // arbitrary X-Forwarded-Host supplied by a caller.
    if(publicOrigin)return origin.origin===new URL(publicOrigin).origin;
    return origin.host===headers.host;
  }catch{return false;}
}
