import {getRemoteSnapshot,isRemoteMode} from './remoteCrm';

export type CapabilityRow={role?:string;permission:string;enabled:boolean};
export type Capability=
 |'contacts.read'|'contacts.write'|'contacts.delete'
 |'deals.read'|'deals.write'|'deals.delete'|'pipeline.read'
 |'tasks.read'|'tasks.write'|'tasks.delete'
 |'calendar.manage'|'reports.read'|'automations.read'|'automations.write'
 |'team.manage'|'workspace.manage'|'roles.manage'|'integration.manage'
 |string;

export const effectiveCapabilities=(role:string|undefined|null,rows:CapabilityRow[]=[]):Set<string>=>{
 const normalized=String(role||'').toLowerCase();
 if(normalized==='owner')return new Set(['*']);
 return new Set(rows.filter(row=>(!row.role||String(row.role).toLowerCase()===normalized)&&row.enabled).map(row=>row.permission));
};
export const hasCapability=(role:string|undefined|null,rows:CapabilityRow[]|undefined,permission:Capability)=>{
 const capabilities=effectiveCapabilities(role,rows||[]);
 return capabilities.has('*')||capabilities.has(permission);
};
export const currentCapability=(permission:Capability,preview=false)=>{
 if(preview||!isRemoteMode())return true;
 const snapshot=getRemoteSnapshot();
 if(!snapshot?.membership.role)return true;
 return hasCapability(snapshot?.membership.role,snapshot?.rolePermissions,permission);
};
