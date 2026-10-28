export type NavigationModule='dashboard'|'contacts'|'pipeline'|'tasks'|'calendar'|'campaigns'|'segments'|'automations'|'reports'|'integrations'|'team'|'settings';
export type PermissionOverride={permission:string;enabled:boolean};

const roleCeilings:Record<string,Set<string>>={
 owner:new Set(['*']),admin:new Set(['*']),
 marketing_manager:new Set(['contacts.read','contacts.write','tasks.read','activities.read','activities.write','tags.read','tags.write','pipeline.read','campaigns.read','campaigns.write','campaigns.delete','forms.read','forms.write','forms.delete','automations.read','automations.write','reports.read']),
 sdr:new Set(['contacts.read','contacts.write','deals.read','tasks.read','tasks.write','activities.read','activities.write','tags.read','pipeline.read','campaigns.read','forms.read','reports.read','calendar.manage']),
 closer:new Set(['contacts.read','contacts.write','deals.read','deals.write','tasks.read','tasks.write','activities.read','activities.write','tags.read','pipeline.read','campaigns.read','reports.read','calendar.manage']),
 viewer:new Set(['contacts.read','deals.read','tasks.read','activities.read','tags.read','pipeline.read','campaigns.read','forms.read','automations.read','reports.read']),
};
const requirements:Record<Exclude<NavigationModule,'dashboard'>,string[][]>={
 contacts:[['contacts.read']],pipeline:[['deals.read'],['pipeline.read']],tasks:[['tasks.read']],calendar:[['calendar.manage']],campaigns:[['campaigns.read']],segments:[['contacts.read']],automations:[['automations.read']],reports:[['reports.read']],integrations:[['integration.manage']],team:[['team.manage']],settings:[['workspace.manage','roles.manage']],
};
const allModules:NavigationModule[]=['dashboard','contacts','pipeline','tasks','calendar','campaigns','segments','automations','reports','integrations','team','settings'];
export function visibleNavigationModules(role:string,overrides:PermissionOverride[]=[]):Set<NavigationModule>{
 const normalized=String(role||'').toLowerCase();const ceiling=roleCeilings[normalized]||new Set<string>();
 const allowed=(permission:string)=>{if(ceiling.has('*'))return true;if(!ceiling.has(permission))return false;return overrides.find(row=>row.permission===permission)?.enabled!==false};
 return new Set(allModules.filter(module=>module==='dashboard'||requirements[module].every(group=>group.some(allowed))));
}
