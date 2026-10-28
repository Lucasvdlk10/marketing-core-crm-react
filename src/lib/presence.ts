export type PresenceOption={id:string;name:string;color:string};
export const defaultPresenceOptions:PresenceOption[]=[
 {id:'online',name:'Online',color:'#16A373'},
 {id:'meeting',name:'Em reunião',color:'#E69B30'},
 {id:'away',name:'Ausente',color:'#816FD0'},
 {id:'offline',name:'Offline',color:'#8793A3'},
];
const key='marketing_core_presence_options';
export function getPresenceOptions():PresenceOption[]{try{const saved=JSON.parse(localStorage.getItem(key)||'null');return Array.isArray(saved)&&saved.length>0?saved:defaultPresenceOptions}catch{return defaultPresenceOptions}}
export function savePresenceOptions(options:PresenceOption[]){localStorage.setItem(key,JSON.stringify(options));window.dispatchEvent(new CustomEvent('marketing-core-presence-updated',{detail:options}))}
