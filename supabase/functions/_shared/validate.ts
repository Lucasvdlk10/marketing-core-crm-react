/** Strict, small input validators for authenticated, privileged Edge operations.
 * Do not use on the signed Leads Hub webhook: its compatibility contract is separate.
 */
type Payload=Record<string,unknown>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function keys(b:Payload,allowed:string[]){for(const name of Object.keys(b))if(!allowed.includes(name))throw Error(`Unknown field: ${name}`);}
function str(b:Payload,k:string,max:number,required=false){const v=b[k];if(v===undefined||v===null){if(required)throw Error(`${k} required`);return '';}if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))throw Error(`Invalid ${k}`);const clean=v.trim();if(required&&!clean)throw Error(`${k} required`);return clean;}
function uuid(b:Payload,k:string,required=true){const value=str(b,k,36,required);if(value&&!UUID.test(value))throw Error(`Invalid UUID ${k}`);return value;}
function email(b:Payload,k:string,required=true){const value=str(b,k,254,required).toLowerCase();if(value&&!EMAIL.test(value))throw Error('Invalid email');return value;}
function choice(b:Payload,k:string,valid:string[]){const v=str(b,k,40,true);if(!valid.includes(v))throw Error(`Invalid ${k}`);return v;}
function bool(b:Payload,k:string){if(b[k]!==undefined&&typeof b[k]!=='boolean')throw Error(`Invalid ${k}`);return b[k] as boolean|undefined;}
export function validateInvite(b:Payload){
 const action=b.action===undefined?'invite':choice(b,'action',['invite','update','deactivate','reactivate','revoke_invite']);
 if(action==='invite'){
  keys(b,['action','workspace_id','email','role']);return {action,workspace_id:uuid(b,'workspace_id'),email:email(b,'email'),role:choice(b,'role',['owner','admin','marketing_manager','sdr','closer','viewer'])};
 }
 if(action==='revoke_invite'){
  keys(b,['action','invitation_id']);return {action,invitation_id:uuid(b,'invitation_id')};
 }
 keys(b,['action','workspace_id','user_id','role',...(action==='update'?['active']:[])]);
 return {action,workspace_id:uuid(b,'workspace_id'),user_id:uuid(b,'user_id'),role:choice(b,'role',['owner','admin','marketing_manager','sdr','closer','viewer']),active:action==='update'?bool(b,'active'):undefined};
}
export function validateIntegration(b:Payload){
 const action=choice(b,'action',['list','create','revoke','list_webhooks','create_webhook','reveal_webhook','rename_webhook','set_webhook_enabled','delete_webhook']);
 const workspace_id=uuid(b,'workspace_id');
 if(action==='list'||action==='list_webhooks'){keys(b,['action','workspace_id']);return {action,workspace_id};}
 if(action==='create'||action==='create_webhook'){keys(b,['action','workspace_id',action==='create'?'label':'name']);return {action,workspace_id,name:str(b,action==='create'?'label':'name',80)||'Leads Hub'};}
 keys(b,['action','workspace_id',action==='revoke'?'key_id':'webhook_id',...(action==='rename_webhook'?['name']:[]),...(action==='set_webhook_enabled'?['enabled']:[])]);
 const webhook_id=uuid(b,action==='revoke'?'key_id':'webhook_id');
 if(action==='rename_webhook')return {action,workspace_id,webhook_id,name:str(b,'name',80,true)};
 if(action==='set_webhook_enabled')return {action,workspace_id,webhook_id,enabled:bool(b,'enabled')};
 return {action,workspace_id,webhook_id};
}
export function validateCalendar(b:Payload){
 const action=choice(b,'action',['start','disconnect','create','update','cancel','reconcile']);
 const fields=['action','workspace_id'];
 if(action==='create'||action==='update')fields.push('summary','start','end','description','idempotency_key','task_id','deal_id');
 if(action==='update')fields.push('google_event_id','etag');
 if(action==='cancel'||action==='reconcile')fields.push('google_event_id','idempotency_key','etag');
 keys(b,fields);
 const workspace_id=uuid(b,'workspace_id');
 if(action==='start'||action==='disconnect')return {action,workspace_id};
 const result:Payload={action,workspace_id};
 result.idempotency_key=str(b,'idempotency_key',180,true);
 if(!/^[A-Za-z0-9._:-]{8,180}$/.test(result.idempotency_key as string))throw Error('Invalid idempotency_key');
 if(action==='create'||action==='update'){
  result.summary=str(b,'summary',200,true);result.description=str(b,'description',1500);
  result.start=str(b,'start',60,true);result.end=str(b,'end',60,true);
  if(!Number.isFinite(Date.parse(result.start as string))||!Number.isFinite(Date.parse(result.end as string))||Date.parse(result.end as string)<=Date.parse(result.start as string))throw Error('Invalid event dates');
  result.task_id=uuid(b,'task_id',false)||undefined;result.deal_id=uuid(b,'deal_id',false)||undefined;
 }
 if(action!=='create'){
  result.google_event_id=str(b,'google_event_id',180,true);
  if(!/^[a-z0-9_]{5,180}$/i.test(result.google_event_id as string))throw Error('Invalid google_event_id');
  result.etag=str(b,'etag',256,action==='update');
 }
 return result;
}
