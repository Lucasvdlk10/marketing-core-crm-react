export type PresenceEvent={userName:string;statusId:string;startedAt:string};
const key='marketing_core_presence_events';
export function recordPresenceChange(userName:string,statusId:string){let events:PresenceEvent[]=[];try{events=JSON.parse(localStorage.getItem(key)||'[]')}catch{}events.push({userName,statusId,startedAt:new Date().toISOString()});localStorage.setItem(key,JSON.stringify(events.slice(-2000)))}
export function getPresenceEvents():PresenceEvent[]{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}}
