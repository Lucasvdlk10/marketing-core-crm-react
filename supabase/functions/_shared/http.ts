/** Only deploy server-side. No service-role key in browser or bundle. */
export const enc = new TextEncoder();
export const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const allowed = () => (Deno.env.get('CORE_ALLOWED_ORIGINS')||'').split(',').map(v=>v.trim()).filter(Boolean);
export function cors(req: Request):Record<string,string> {
 const origin=req.headers.get('origin')||'';
 return origin&&allowed().includes(origin)?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,GET,OPTIONS'}:{};
}
export function response(req:Request,status:number,body:unknown) {
 return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...cors(req)}});
}
export function env(name:string){const v=Deno.env.get(name);if(!v)throw new Error(`Missing ${name}`);return v;}
export async function parseBody(req:Request,max=12000) {
 if(Number(req.headers.get('content-length')||0)>max)throw new Error('Payload too large');
 const raw=await req.text();if(enc.encode(raw).length>max)throw new Error('Payload too large');
 const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Object required');
 return value;
}
export async function auth(req:Request) {
 const bearer=req.headers.get('authorization')||'';
 if(!/^Bearer\s+\S+$/i.test(bearer))throw new Error('Authentication required');
 const endpoint=env('SUPABASE_URL');const key=env('SUPABASE_ANON_KEY');
 const res=await fetch(`${endpoint}/auth/v1/user`,{headers:{apikey:key,authorization:bearer}});
 if(!res.ok)throw new Error('Invalid session');
 const user=await res.json();if(!user.id)throw new Error('Invalid session');
 return {bearer,user};
}
export async function rpc(fn:string,values:unknown,bearer?:string) {
 const service=env('SUPABASE_SERVICE_ROLE_KEY');
 const key=bearer?env('SUPABASE_ANON_KEY'):service;
 const res=await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:key,authorization:bearer||`Bearer ${service}`,'content-type':'application/json'},body:JSON.stringify(values)});
 const body=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(`Database ${res.status}: ${typeof body.message==='string'?body.message:'request failed'}`);
 return body;
}
export async function serviceRest(path:string,init:RequestInit={}) {
 const key=env('SUPABASE_SERVICE_ROLE_KEY');
 return fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`,{...init,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',...(init.headers||{})}});
}
export function errorStatus(e:unknown){const s=String(e);return /permission|forbidden|inactive|verified|role|owner|allowed/i.test(s)?403:/size/i.test(s)?413:/session|auth/i.test(s)?401:/limit|conflict|already|last/i.test(s)?409:422;}
