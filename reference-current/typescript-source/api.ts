export type Row = Record<string, any>;
export type Session = { access_token:string;refresh_token:string;expires_at:number;user?:Row };
export type Config = {url:string;anonKey:string;leadsHubUrl?:string;leadsHubFormToken?:string};
declare global {interface Window {CORE_CONFIG?:Config}}
const storageKey='marketing_core_session_v1';
let session:Session|null=null;
export function configured(){const c=window.CORE_CONFIG;return !!(c?.url&&c?.anonKey&&/^https:\/\//.test(c.url)&&!c.url.includes('YOUR_PROJECT')&&c.anonKey.length>20)}
export function config():Config{if(!configured())throw Error('Supabase não configurado. Abra o GUIA_DE_INSTALACAO.md e configure crm/config.js.');return window.CORE_CONFIG!;}
export function getSession(){return session;}
export function loadSession(){try{session=JSON.parse(sessionStorage.getItem(storageKey)||'null');return session;}catch{return null}}
export function putSession(s:any){session={access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600),user:s.user};sessionStorage.setItem(storageKey,JSON.stringify(session));return session}
export function clearSession(){session=null;sessionStorage.removeItem(storageKey)}
const base=()=>config().url.replace(/\/$/,'');
const errorText=(obj:any,status:number)=>obj?.msg||obj?.error_description||obj?.message||obj?.error||obj?.details||`HTTP ${status}`;
async function unpack(r:Response){const txt=await r.text();let data:any;try{data=txt?JSON.parse(txt):null}catch{data=txt}if(!r.ok)throw Error(errorText(data,r.status));return data}
async function auth(path:string,body:Row, token?:string){const c=config();const r=await fetch(`${base()}/auth/v1/${path}`,{method:'POST',headers:{apikey:c.anonKey,'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return unpack(r)}
export async function signIn(email:string,password:string){return putSession(await auth('token?grant_type=password',{email,password}))}
const appBase=()=>new URL('./',location.href).origin+new URL('./',location.href).pathname;
export async function signUp(email:string,password:string){return auth('signup',{email,password,options:{email_redirect_to:appBase()}})}
export async function recover(email:string){return auth('recover',{email,options:{redirect_to:appBase()}})}
export async function captureAccessLead(payload:Row){
 const c=config();const endpoint=c.leadsHubUrl||'https://app.marketingcore.com.br/leads-hub/api/leads/ingest';
 const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,...(c.leadsHubFormToken?{form_token:c.leadsHubFormToken}:{})})});
 return unpack(r);
}
export async function updatePassword(password:string){await request('/auth/v1/user',{method:'PUT',body:JSON.stringify({password})})}
export async function exchangeRecoveryHash(){const hash=new URLSearchParams(location.hash.slice(1));const access_token=hash.get('access_token'),refresh_token=hash.get('refresh_token');if(access_token&&refresh_token){putSession({access_token,refresh_token,expires_in:Number(hash.get('expires_in')||3600)});const type=hash.get('type');history.replaceState(null,'',location.pathname+location.search);return type==='recovery'||type==='invite'}return false}
export async function refresh(){if(!session?.refresh_token)return false;try{putSession(await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}));return true}catch{clearSession();return false}}
export async function signOut(){try{if(session?.access_token)await auth('logout',{},session.access_token)}finally{clearSession()}}
export async function request(path:string, options:RequestInit={}, authenticated=true, secondTry=true):Promise<any>{
 const c=config();
 if(authenticated&&(!session?.access_token||session.expires_at<Date.now()/1000+40)){
  if(!await refresh())throw Error('Sua sessão expirou. Entre novamente.');
 }
 const heads:Record<string,string>={apikey:c.anonKey,...(authenticated?{authorization:`Bearer ${session!.access_token}`}:{})};
 new Headers(options.headers).forEach((value,key)=>{heads[key]=value});
 const r=await fetch(`${base()}${path}`,{...options,headers:heads,cache:'no-store'});
 if(r.status===401&&authenticated&&secondTry&&await refresh())return request(path,options,authenticated,false);
 return unpack(r);
}
export async function getUser(){return request('/auth/v1/user')}
function enc(v:string){return encodeURIComponent(v)}
export function q(params:Record<string,string|number|undefined>){return Object.entries(params).filter(([,v])=>v!==undefined).map(([k,v])=>`${enc(k)}=${enc(String(v))}`).join('&')}
export async function list(table:string,workspace:string,extra:Record<string,string|number|undefined>={},limit=1000){
 const records:Row[]=[];
 for(let offset=0;offset<20;offset+=1){
  const part=await request(`/rest/v1/${table}?${q({select:'*',workspace_id:`eq.${workspace}`,order:'created_at.desc',limit,offset:offset*limit,...extra})}`);
  if(!Array.isArray(part))throw Error(`Resposta inválida para ${table}`);
  records.push(...part);
  if(part.length<limit)break;
  if(offset===19)throw Error(`Muitas linhas em ${table}; utilize filtros para reduzir a consulta.`);
 }
 return records;
}
export async function select(table:string,filters:Record<string,string|number|undefined>,extra:Record<string,string|number|undefined>={}){return request(`/rest/v1/${table}?${q({select:'*',...filters,...extra})}`)}
export async function insert(table:string,body:Row){const arr=await request(`/rest/v1/${table}`,{method:'POST',headers:{'content-type':'application/json',Prefer:'return=representation'},body:JSON.stringify(body)});return arr[0]}
export async function update(table:string,id:string,ws:string,body:Row){const arr=await request(`/rest/v1/${table}?${q({id:`eq.${id}`,workspace_id:`eq.${ws}`})}`,{method:'PATCH',headers:{'content-type':'application/json',Prefer:'return=representation'},body:JSON.stringify(body)});if(!arr.length)throw Error('Registro não atualizado; verifique permissões.');return arr[0]}
export async function del(table:string,id:string,ws:string){await request(`/rest/v1/${table}?${q({id:`eq.${id}`,workspace_id:`eq.${ws}`})}`,{method:'DELETE'})}
export async function rpc(method:string,body:Row){return request(`/rest/v1/rpc/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}
export async function fn(method:string,body:Row){return request(`/functions/v1/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}
export function companyLogoUrl(path:string){return path?`${base()}/storage/v1/object/public/company-logos/${path.split('/').map(enc).join('/')}`:''}
export async function uploadCompanyLogo(workspace:string,file:File){
 const ext=file.name.split('.').pop()?.toLowerCase()||'';
 const mime:Record<string,string>={svg:'image/svg+xml',webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
 if(!mime[ext])throw Error('Formato inválido. Use SVG, WebP, PNG ou JPG.');
 if(file.size>2*1024*1024)throw Error('A logo deve ter no máximo 2 MB.');
 const path=`${workspace}/logo-${Date.now()}.${ext}`;
 await request(`/storage/v1/object/company-logos/${path}`,{method:'POST',headers:{'content-type':mime[ext],'x-upsert':'false'},body:file});
 return path;
}
export async function deleteCompanyLogo(path:string){if(path)await request(`/storage/v1/object/company-logos/${path}`,{method:'DELETE'})}
export function writeCSV(rows:Row[],columns:[string,string][],file:string){
 const excel=(v:any)=>{const s=String(v??'');const safe=/^[=+\-@\t\r]/.test(s)?`'${s}`:s;return `"${safe.replace(/"/g,'""')}"`};
 const content='\ufeff'+[columns.map(([,title])=>excel(title)).join(';'),...rows.map(row=>columns.map(([key])=>excel(row[key])).join(';'))].join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
