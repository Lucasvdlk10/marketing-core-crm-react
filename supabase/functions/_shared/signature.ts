/** No Deno dependencies: importable by Node for executable HMAC contract tests. */
const enc=new TextEncoder();
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
export function equalsConstantTime(a:string,b:string){
 if(!/^[a-f0-9]{64}$/.test(a)||! /^[a-f0-9]{64}$/.test(b))return false;
 let delta=0;for(let i=0;i<64;i++)delta|=a.charCodeAt(i)^b.charCodeAt(i);
 return delta===0;
}
export async function sign(key:string,timestamp:string,rawBody:string){
 const material=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',material,enc.encode(`${timestamp}.${rawBody}`)));
}
export async function verify(key:string,timestamp:string,rawBody:string,sig:string){
 return equalsConstantTime(await sign(key,timestamp,rawBody),sig.replace(/^sha256=/,'').toLowerCase());
}
export function inReplayWindow(timestamp:string, nowEpochSeconds:number){
 if(!/^[0-9]{10,13}$/.test(timestamp))return false;
 const epoch=Number(timestamp);return Number.isSafeInteger(epoch)&&Math.abs(nowEpochSeconds-epoch)<=300;
}
