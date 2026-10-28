export type SessionAuditType='login'|'idle_prompt'|'idle_answer_yes'|'idle_answer_no'|'logout_timeout'|'logout_declared_offline'|'logout_manual';
export type SessionAuditEvent={id:string;userName:string;type:SessionAuditType;timestamp:string;offlineMinutes?:number};
const key='marketing_core_session_audit';
export function recordSessionAudit(userName:string,type:SessionAuditType,offlineMinutes?:number){const event:SessionAuditEvent={id:`audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,userName,type,timestamp:new Date().toISOString(),...(offlineMinutes?{offlineMinutes}:{})};let events:SessionAuditEvent[]=[];try{events=JSON.parse(localStorage.getItem(key)||'[]')}catch{}events.push(event);localStorage.setItem(key,JSON.stringify(events.slice(-5000)));window.dispatchEvent(new CustomEvent('marketing-core-session-audit',{detail:event}));return event}
export function getSessionAudit():SessionAuditEvent[]{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}}
