export type LeadTagConfig={id:string;name:string;color:string};
import {getRemoteSnapshot,isRemoteMode,refreshRemoteCrm,remoteDelete,remoteInsert,remoteUpdate} from './remoteCrm';

const STORAGE_KEY='marketing_core_lead_tags';
export const LEAD_TAGS_UPDATED_EVENT='marketing-core-lead-tags-updated';

const defaultTags:LeadTagConfig[]=[
 {id:'tag-vip',name:'VIP',color:'#6366F1'},
 {id:'tag-priority',name:'Prioridade alta',color:'#E85D75'},
 {id:'tag-return',name:'Retorno pendente',color:'#E59A2F'},
 {id:'tag-active',name:'Cliente ativo',color:'#159A75'},
];

export function getLeadTags():LeadTagConfig[]{
 if(isRemoteMode())return(getRemoteSnapshot()?.tags||[]).map(tag=>({id:tag.id,name:tag.name,color:tag.color}));
 try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(Array.isArray(parsed))return parsed.filter(tag=>tag&&typeof tag.name==='string'&&tag.name.trim()).map(tag=>({...tag,name:tag.name.trim(),color:tag.color||'#6366F1'}))}catch{}
 return defaultTags.map(tag=>({...tag}));
}

export async function saveLeadTags(tags:LeadTagConfig[]):Promise<void>{
 const normalized=tags.map(tag=>({...tag,name:tag.name.trim(),color:tag.color||'#6366F1'})).filter((tag,index,list)=>tag.name&&list.findIndex(item=>item.name.toLocaleLowerCase('pt-BR')===tag.name.toLocaleLowerCase('pt-BR'))===index);
 if(isRemoteMode()){const before=getRemoteSnapshot()?.tags||[];const ids=new Set(normalized.map(tag=>tag.id));for(const tag of normalized){if(before.some(item=>item.id===tag.id))await remoteUpdate('core_tags',tag.id,{name:tag.name,color:tag.color},false);else await remoteInsert('core_tags',{name:tag.name,color:tag.color},false)}for(const tag of before)if(!ids.has(tag.id))await remoteDelete('core_tags',tag.id,false);await refreshRemoteCrm();return}
 localStorage.setItem(STORAGE_KEY,JSON.stringify(normalized));
 window.dispatchEvent(new Event(LEAD_TAGS_UPDATED_EVENT));
}
