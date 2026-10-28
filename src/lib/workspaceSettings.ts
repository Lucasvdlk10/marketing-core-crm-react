import {crmApi} from './api';
import {getRemoteWorkspaceId} from './remoteCrm';
import {defaultDealActions,setRemoteDealActions} from './dealActions';
import {defaultLossReasons,setRemoteLossReasons} from './lossReasons';

const clean=(value:unknown,fallback:string[])=>Array.isArray(value)?value.map(String).map(item=>item.trim()).filter(Boolean):fallback;

export async function loadRemoteCommercialSettings(){
  if(!crmApi)return{lossReasons:defaultLossReasons,dealActions:defaultDealActions};
  const w=getRemoteWorkspaceId();
  if(!w)return{lossReasons:defaultLossReasons,dealActions:defaultDealActions};
  const[lossValue,actionValue]=await Promise.all([
    crmApi.rpc('core_workspace_setting_read',{w,p_key:'loss_reasons'}),
    crmApi.rpc('core_workspace_setting_read',{w,p_key:'deal_actions'}),
  ]);
  const lossReasons=clean(lossValue,defaultLossReasons);
  const dealActions=clean(actionValue,defaultDealActions);
  setRemoteLossReasons(lossReasons);
  setRemoteDealActions(dealActions);
  return{lossReasons,dealActions};
}

export async function saveRemoteCommercialSetting(key:'loss_reasons'|'deal_actions',values:string[]){
  if(!crmApi)throw Error('Supabase não configurado.');
  const w=getRemoteWorkspaceId();
  if(!w)throw Error('Workspace ativo não encontrado.');
  const cleanValues=clean(values,[]);
  if(!cleanValues.length)throw Error('Mantenha pelo menos uma opção.');
  const persisted=clean(await crmApi.rpc('core_workspace_setting_write',{w,p_key:key,p_value:cleanValues}),cleanValues);
  if(key==='loss_reasons')setRemoteLossReasons(persisted);else setRemoteDealActions(persisted);
  return persisted;
}

const roleDefinitions=[
  {id:'owner',name:'Proprietário',protected:true},
  {id:'admin',name:'Administrador',protected:true},
  {id:'marketing_manager',name:'Gestor de marketing'},
  {id:'sdr',name:'SDR'},
  {id:'closer',name:'Closer'},
  {id:'viewer',name:'Visualizador'},
] as const;
const permissionMap={
  leads:['contacts.read','contacts.write'],
  pipeline:['deals.read','deals.write','pipeline.read'],
  tasks:['tasks.read','tasks.write'],
  calendar:['calendar.manage'],
  reports:['reports.read'],
  automations:['automations.read','automations.write'],
  team:['team.manage'],
  settings:['workspace.manage','roles.manage'],
} as const;
export type RemoteAccessPermission=keyof typeof permissionMap;
const roleAllowed:Record<string,RemoteAccessPermission[]>={
  owner:['leads','pipeline','tasks','calendar','reports','automations','team','settings'],
  admin:['leads','pipeline','tasks','calendar','reports','automations','team','settings'],
  marketing_manager:['leads','tasks','reports','automations'],
  sdr:['leads','pipeline','tasks','calendar','reports'],
  closer:['leads','pipeline','tasks','calendar','reports'],
  viewer:['leads','pipeline','tasks','reports','automations'],
};
export type RemoteAccessRole={id:string;name:string;permissions:RemoteAccessPermission[];protected?:boolean};
export const isRemoteRolePermissionAvailable=(role:string,permission:RemoteAccessPermission)=>roleAllowed[role]?.includes(permission)??false;

export async function loadRemoteAccessRoles():Promise<RemoteAccessRole[]>{
  if(!crmApi)return[];
  const w=getRemoteWorkspaceId();if(!w)return[];
  const rows=await crmApi.request(`/rest/v1/core_role_permissions?select=role,permission,enabled&workspace_id=eq.${encodeURIComponent(w)}`) as {role:string;permission:string;enabled:boolean}[];
  return roleDefinitions.map(role=>({id:role.id,name:role.name,protected:'protected'in role&&role.protected,permissions:(Object.entries(permissionMap) as [RemoteAccessPermission,readonly string[]][]).filter(([key,required])=>roleAllowed[role.id].includes(key)&&required.every(permission=>rows.find(row=>row.role===role.id&&row.permission===permission)?.enabled!==false)).map(([key])=>key)}));
}

export async function saveRemoteAccessRoles(roles:RemoteAccessRole[]){
  if(!crmApi)throw Error('Supabase não configurado.');
  const w=getRemoteWorkspaceId();if(!w)throw Error('Workspace ativo não encontrado.');
  for(const role of roles.filter(item=>!item.protected))for(const[key,permissions]of Object.entries(permissionMap) as [RemoteAccessPermission,readonly string[]][]){
    if(!roleAllowed[role.id]?.includes(key))continue;
    for(const permission of permissions){
      try{await crmApi.rpc('core_team_set_permission',{w,p_role:role.id,p_permission:permission,p_enabled:role.permissions.includes(key)})}catch(error){
        const message=error instanceof Error?error.message:'';
        if(!/ceiling|beyond/i.test(message))throw error;
      }
    }
  }
  return loadRemoteAccessRoles();
}
