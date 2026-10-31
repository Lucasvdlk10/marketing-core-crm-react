export type LeadPayload={name:string;email:string;phone:string;company:string;source:string;campaign:string;source_url:string;form_id:string;consent:boolean;utm:{source:string;medium:string;campaign:string;content:string;term:string};submission_id:string;has_identity:boolean;raw_fields:Record<string,unknown>};
const text=(v:unknown,max:number)=>String(v??'').trim().slice(0,max);
const consentValue=(...values:unknown[])=>{const value=values.find(item=>item!==undefined&&item!==null);if(typeof value==='boolean')return value;if(typeof value==='number')return value===1;if(typeof value==='string')return ['1','true','sim','yes','on'].includes(value.trim().toLowerCase());return false};
export function normalizeLeadPayload(p:Record<string,unknown>):LeadPayload {
 const tracking=(p.tracking&&typeof p.tracking==='object'&&!Array.isArray(p.tracking)?p.tracking:{}) as Record<string,unknown>;
 const incomingUtm=(p.utm&&typeof p.utm==='object'&&!Array.isArray(p.utm)?p.utm:{}) as Record<string,unknown>;
 const submissionSource=p.submission_id??p.submissionId??p.event_id;
 if(typeof submissionSource==='string'&&submissionSource.trim().length>180)throw Error('Invalid submission id');
 const name=text(p.name??p.full_name??p.nome,200),email=text(p.email,254),phone=text(p.phone??p.telefone,35),submission_id=text(submissionSource,180),has_identity=Boolean(name&&(email||phone));
 if((!has_identity&&!submission_id)||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(phone&&phone.replace(/\D/g,'').length<8))throw Error('Invalid lead identity');
 const source_url=text(p.source_url??p.page_url??p.page??p.lp_url,500);
 if(source_url){try{const u=new URL(source_url);if(!['https:','http:'].includes(u.protocol))throw Error();}catch{throw Error('Invalid source URL');}}
 const utm={
  source:text(incomingUtm.source??p.utm_source??tracking.utm_source,150),
  medium:text(incomingUtm.medium??p.utm_medium??tracking.utm_medium,150),
  campaign:text(incomingUtm.campaign??p.utm_campaign??tracking.utm_campaign,150),
  content:text(incomingUtm.content??p.utm_content??tracking.utm_content,150),
  term:text(incomingUtm.term??p.utm_term??tracking.utm_term,150)
 };
 return {name,email,phone,company:text(p.company??p.empresa,180),source:text(p.source??p.origin,100)||(has_identity?'Leads Hub':''),campaign:text(p.campaign??p.utm_campaign??tracking.utm_campaign,180),source_url,form_id:text(p.form_id??p.form_name??p.conversion_identifier,100),consent:consentValue(p.consent,p.consentimento),utm,submission_id,has_identity,raw_fields:JSON.parse(JSON.stringify(p)) as Record<string,unknown>};
}
export function extractApiKey(headers:Headers){
 const explicit=(headers.get('x-core-api-key')||'').trim();
 const bearer=(headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()||'';
 const value=explicit||bearer;
 return /^[a-f0-9]{64}$/.test(value)?value:'';
}
export async function fallbackIdempotency(raw:string,scope=''){
 const input=scope?`${scope}\n${raw}`:raw;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
 return 'body-'+[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
