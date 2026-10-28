export type AccessPermission='leads'|'pipeline'|'tasks'|'calendar'|'reports'|'automations'|'team'|'settings';
export type AccessRole={id:string;name:string;permissions:AccessPermission[];protected?:boolean};
export const permissionLabels:Record<AccessPermission,string>={leads:'Leads e contatos',pipeline:'Pipeline e negociações',tasks:'Tarefas',calendar:'Calendário',reports:'Relatórios',automations:'Automações e integrações',team:'Equipe e acessos',settings:'Configurações administrativas'};
const key='marketing_core_access_roles';
const all=Object.keys(permissionLabels) as AccessPermission[];
export const defaultAccessRoles:AccessRole[]=[{id:'administrator',name:'Administrador',permissions:all,protected:true},{id:'sales-manager',name:'Gestora comercial',permissions:['leads','pipeline','tasks','calendar','reports','team']},{id:'sdr',name:'SDR',permissions:['leads','pipeline','tasks','calendar']},{id:'analyst',name:'Analista',permissions:['leads','tasks','calendar','reports']}];
export const getAccessRoles=():AccessRole[]=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return Array.isArray(value)&&value.length?value:defaultAccessRoles}catch{return defaultAccessRoles}};
export const saveAccessRoles=(roles:AccessRole[])=>{const clean=roles.map(role=>({...role,name:role.name.trim(),permissions:role.protected?all:role.permissions})).filter(role=>role.name);localStorage.setItem(key,JSON.stringify(clean.length?clean:defaultAccessRoles));window.dispatchEvent(new Event('marketing-core-access-roles-updated'))};
export const subscribeAccessRoles=(listener:()=>void)=>{window.addEventListener('marketing-core-access-roles-updated',listener);return()=>window.removeEventListener('marketing-core-access-roles-updated',listener)};
