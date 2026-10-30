import {effectiveCapabilities,type CapabilityRow} from './effectivePermissions';
export type NavigationModule='dashboard'|'contacts'|'pipeline'|'tasks'|'calendar'|'campaigns'|'segments'|'automations'|'reports'|'integrations'|'team'|'settings';
export type PermissionOverride=CapabilityRow;
const requirements:Record<Exclude<NavigationModule,'dashboard'>,string[][]>={
 contacts:[['contacts.read']],pipeline:[['deals.read'],['pipeline.read']],tasks:[['tasks.read']],calendar:[['calendar.manage']],campaigns:[['campaigns.read']],segments:[['contacts.read']],automations:[['automations.read']],reports:[['reports.read']],integrations:[['integration.manage']],team:[['team.manage']],settings:[['workspace.manage','roles.manage']],
};
const allModules:NavigationModule[]=['dashboard','contacts','pipeline','tasks','calendar','campaigns','segments','automations','reports','integrations','team','settings'];
export function visibleNavigationModules(role:string,overrides:PermissionOverride[]=[]):Set<NavigationModule>{
 const capabilities=effectiveCapabilities(role,overrides);
 const allowed=(permission:string)=>capabilities.has('*')||capabilities.has(permission);
 return new Set(allModules.filter(module=>module==='dashboard'||requirements[module].every(group=>group.some(allowed))));
}