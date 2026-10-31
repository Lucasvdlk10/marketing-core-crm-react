/** CRM ingress: signed webhook (HMAC) or server API key over HTTPS. */
import {enc,env,rpc} from '../_shared/http.ts';
import {verify,inReplayWindow} from '../_shared/signature.ts';
import {normalizeLeadPayload,extractApiKey,fallbackIdempotency} from '../_shared/lead.ts';
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return json(405,{error:'POST required'});
 if(Number(req.headers.get('content-length')||0)>12000)return json(413,{error:'Payload too large'});
 const raw=await req.text();if(enc.encode(raw).length>12000)return json(413,{error:'Payload too large'});
 const publicId=new URL(req.url).pathname.split('/').filter(Boolean).at(-1)||'';
 const routedWebhook=/^[a-f0-9]{32}$/.test(publicId);
 const apiKey=extractApiKey(req.headers);
 const signedKey=(req.headers.get('x-core-ingest-key')||'').trim();
 let key='';
 if(apiKey){key=apiKey;}
 else {
  const sig=req.headers.get('x-core-signature')||'',ts=req.headers.get('x-core-timestamp')||'';
  if(!/^[a-f0-9]{64}$/.test(signedKey)||!/^[0-9]{10,13}$/.test(ts))return json(400,{error:'Invalid authentication headers'});
  if(!inReplayWindow(ts,Date.now()/1000))return json(401,{error:'Expired timestamp'});
  if(!(await verify(signedKey,ts,raw,sig)))return json(401,{error:'Invalid signature'});
  key=signedKey;
 }
 let p:ReturnType<typeof normalizeLeadPayload>;
 try{p=normalizeLeadPayload(JSON.parse(raw));}catch{return json(422,{error:'Invalid lead payload'});}
 const providedIdem=(req.headers.get('idempotency-key')||'').trim();
 const idem=await fallbackIdempotency(raw,`lead-ingestion-v1:${/^[A-Za-z0-9._:-]{8,180}$/.test(providedIdem)?providedIdem:'body'}`);
 try{
  env('SUPABASE_URL');env('SUPABASE_SERVICE_ROLE_KEY');
  const workspace=routedWebhook
   ? await rpc('core_workspace_webhook_authorize',{p_public_id:publicId,p_token:key})
   : await rpc('core_ingest_authorize_v2',{p_key:key});
  if(!workspace)return json(401,{error:'Integration inactive or unauthorized'});
  const result=await rpc('core_ingest_lead_v2',{p_workspace:workspace,p_key:idem,p_payload:p});
  return json(result.duplicate?200:201,{ok:true,auth_mode:apiKey?'api_key':'hmac',...result});
 }catch(e){
  const msg=String(e);if(msg.includes('Rate limit'))return json(429,{error:'Rate limit',retry_after_seconds:60});
  if(msg.includes('Idempotency')||msg.includes('23505'))return json(409,{error:'Idempotency conflict'});
  console.error('ingest failed: sanitized',e instanceof Error?e.name:'error');return json(503,{error:'Temporarily unavailable'});
 }
});
