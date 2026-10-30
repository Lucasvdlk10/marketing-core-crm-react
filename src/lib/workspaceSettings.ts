import {crmApi} from './api';
import {getRemoteWorkspaceId} from './remoteCrm';
import {defaultDealActions,setRemoteDealActions} from './dealActions';
import {defaultLossReasons,setRemoteLossReasons} from './lossReasons';
import {defaultLeadSources,setRemoteLeadSources} from './leadSources';

const clean=(value:unknown,fallback:string[])=>Array.isArray(value)?value.map(String).map(item=>item.trim()).filter(Boolean):fallback;

export async function loadRemoteCommercialSettings(){
  if(!crmApi)return{lossReasons:defaultLossReasons,dealActions:defaultDealActions,leadSources:defaultLeadSources};
  const w=getRemoteWorkspaceId();
  if(!w)return{lossReasons:defaultLossReasons,dealActions:defaultDealActions,leadSources:defaultLeadSources};
  const[lossValue,actionValue,sourceValue]=await Promise.all([
    crmApi.rpc('core_workspace_setting_read',{w,p_key:'loss_reasons'}),
    crmApi.rpc('core_workspace_setting_read',{w,p_key:'deal_actions'}),
    crmApi.rpc('core_workspace_setting_read',{w,p_key:'lead_sources'}),
  ]);
  const lossReasons=clean(lossValue,defaultLossReasons);
  const dealActions=clean(actionValue,defaultDealActions);
  const leadSources=clean(sourceValue,defaultLeadSources);
  setRemoteLossReasons(lossReasons);
  setRemoteDealActions(dealActions);
  setRemoteLeadSources(leadSources);
  return{lossReasons,dealActions,leadSources};
}

export async function saveRemoteCommercialSetting(key:'loss_reasons'|'deal_actions'|'lead_sources',values:string[]){
  if(!crmApi)throw Error('Supabase não configurado.');
  const w=getRemoteWorkspaceId();
  if(!w)throw Error('Workspace ativo não encontrado.');
  const cleanValues=clean(values,[]);
  if(!cleanValues.length)throw Error('Mantenha pelo menos uma opção.');
  const persisted=clean(await crmApi.rpc('core_workspace_setting_write',{w,p_key:key,p_value:cleanValues}),cleanValues);
  if(key==='loss_reasons')setRemoteLossReasons(persisted);else if(key==='deal_actions')setRemoteDealActions(persisted);else setRemoteLeadSources(persisted);
  return persisted;
}

const roleDefinitions=[
  {id:'owner',name:'Proprietário',protected:true},
  {id:'admin',name:'Administrador'},
  {id:'marketing_manager',name:'Gestor de marketing'},
  {id:'sdr',name:'SDR'},
  {id:'closer',name:'Closer'},
  {id:'viewer',name:'Visualizador'},
] as const;
const permissionMap={
  leads:['contacts.read'],
  leadsWrite:['contacts.write'],
  leadsDelete:['contacts.delete'],
  pipeline:['deals.read','pipeline.read'],
  pipelineWrite:['deals.write'],
  pipelineDelete:['deals.delete'],
  tasks:['tasks.read'],
  tasksWrite:['tasks.write'],
  tasksDelete:['tasks.delete'],
  calendar:['calendar.manage'],
  reports:['reports.read'],
  automations:['automations.read','automations.write'],
  team:['team.manage'],
  settings:['workspace.manage','roles.manage'],
} as const;
export type RemoteAccessPermission=keyof typeof permissionMap;
const allPermissions=Object.keys(permissionMap) as RemoteAccessPermission[];
export type RemoteAccessRole={id:string;name:string;permissions:RemoteAccessPermission[];protected?:boolean};
export const isRemoteRolePermissionAvailable=(role:string,_permission:RemoteAccessPermission)=>role!=='owner';

export async function loadRemoteAccessRoles():Promise<RemoteAccessRole[]>{
  if(!crmApi)return[];
  const w=getRemoteWorkspaceId();if(!w)return[];
  const [rows,custom]=await Promise.all([
    crmApi.request(`/rest/v1/core_role_permissions?select=role,permission,enabled&workspace_id=eq.${encodeURIComponent(w)}`) as Promise<{role:string;permission:string;enabled:boolean}[]>,
    crmApi.request(`/rest/v1/core_workspace_roles?select=id,name&workspace_id=eq.${encodeURIComponent(w)}&order=created_at.asc,id.asc`) as Promise<{id:string;name:string}[]>,
  ]);
  const definitions=[...roleDefinitions,...custom.map(role=>({...role,protected:false}))];
  return definitions.map(role=>({id:role.id,name:role.name,protected:'protected'in role&&role.protected,permissions:role.id==='owner'?allPermissions:(Object.entries(permissionMap) as [RemoteAccessPermission,readonly string[]][]).filter(([,required])=>required.every(permission=>rows.find(row=>row.role===role.id&&row.permission===permission)?.enabled===true)).map(([key])=>key)}));
}

export async function saveRemoteAccessRoles(roles:RemoteAccessRole[]){
  if(!crmApi)throw Error('Supabase não configurado.');
  const w=getRemoteWorkspaceId();if(!w)throw Error('Workspace ativo não encontrado.');
  const customRoles=roles.filter(role=>role.id.startsWith('custom-')).map(role=>({id:role.id,name:role.name.trim()}));
  await crmApi.rpc('core_workspace_roles_replace',{w,p_roles:customRoles});
  for(const role of roles.filter(item=>!item.protected))for(const[key,permissions]of Object.entries(permissionMap) as [RemoteAccessPermission,readonly string[]][]){

    for(const permission of permissions){
      await crmApi.rpc('core_team_set_permission',{w,p_role:role.id,p_permission:permission,p_enabled:role.permissions.includes(key)});
    }
  }
  return loadRemoteAccessRoles();
}
