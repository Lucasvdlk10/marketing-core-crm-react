import {validateIntegration} from '../_shared/validate.ts';
import {auth,rpc,response,parseBody,cors,errorStatus,env} from '../_shared/http.ts';

const webhookUrl=(publicId:string)=>`${env('SUPABASE_URL').replace(/\/$/,'')}/functions/v1/core-webhook-v2/${publicId}`;
const rows=<T>(value:T|T[])=>Array.isArray(value)?value:[value];

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
 if(req.method!=='POST')return response(req,405,{error:'POST only'});
 try{
  const {bearer}=await auth(req);
  const b=validateIntegration(await parseBody(req,2048));
  const w=String(b.workspace_id||'');
  if(!/^[a-f\d-]{36}$/i.test(w))return response(req,422,{error:'Invalid workspace'});
  if(b.action==='list_webhooks'||b.action==='list'){
   const result=await rpc('core_workspace_webhook_list',{w},bearer);
   const webhooks=rows(result).map((item:any)=>({...item,url:webhookUrl(String(item.public_id))}));
   return response(req,200,{webhooks});
  }
  if(b.action==='create_webhook'||b.action==='create'){
   const result=rows(await rpc('core_workspace_webhook_create',{w,p_name:b.name},bearer))[0] as any;
   return response(req,201,{webhook:{...result,url:webhookUrl(String(result.public_id))}});
  }
  if(b.action==='reveal_webhook')return response(req,200,{token:await rpc('core_workspace_webhook_reveal',{w,p_webhook:b.webhook_id},bearer)});
  if(b.action==='rename_webhook'){await rpc('core_workspace_webhook_rename',{w,p_webhook:b.webhook_id,p_name:b.name},bearer);return response(req,200,{ok:true});}
  if(b.action==='set_webhook_enabled'){
   if(typeof b.enabled!=='boolean')return response(req,422,{error:'enabled required'});
   await rpc('core_workspace_webhook_set_enabled',{w,p_webhook:b.webhook_id,p_enabled:b.enabled},bearer);return response(req,200,{ok:true});
  }
  if(b.action==='delete_webhook'||b.action==='revoke'){await rpc('core_workspace_webhook_delete',{w,p_webhook:b.webhook_id},bearer);return response(req,200,{ok:true});}
  return response(req,400,{error:'Unsupported action'});
 }catch(e){return response(req,errorStatus(e),{error:String(e instanceof Error?e.message:e)});}
});
