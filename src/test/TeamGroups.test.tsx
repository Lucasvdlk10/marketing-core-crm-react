import {render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const {request,invokeFunction,rpc}=vi.hoisted(()=>({request:vi.fn(),invokeFunction:vi.fn(),rpc:vi.fn()}));
vi.mock('../lib/api',()=>({crmApi:{request,invokeFunction,rpc,recover:vi.fn()}}));
vi.mock('../lib/remoteCrm',()=>({
  getRemoteWorkspaceId:()=> 'workspace-1',
  getRemoteSnapshot:()=>({members:[{user_id:'user-1',full_name:'Ana Admin'},{user_id:'user-2',full_name:'Bruno SDR'}]}),
}));

import {TeamPage} from '../pages/TeamPage';

const memberships=[
  {workspace_id:'workspace-1',user_id:'user-1',role:'admin',active:true,joined_at:'2026-10-01T00:00:00Z'},
  {workspace_id:'workspace-1',user_id:'user-2',role:'sdr',active:true,joined_at:'2026-10-02T00:00:00Z'},
];
const directory=[
  {user_id:'user-1',full_name:'Ana Admin',email:'ana@example.com'},
  {user_id:'user-2',full_name:'Bruno SDR',email:'bruno@example.com'},
];
let groups:Array<{id:string;name:string;member_ids:string[];created_at:string}>;

function respond(path:string){
  if(path.includes('core_memberships'))return Promise.resolve(memberships);
  if(path.includes('core_invitations'))return Promise.resolve([]);
  return Promise.reject(new Error(`unexpected ${path}`));
}

function rpcRespond(name:string,args:Record<string,unknown>){
  if(name==='core_team_member_directory')return Promise.resolve(directory);
  if(name==='core_team_groups')return Promise.resolve(groups.map(group=>({...group})));
  if(name==='core_team_group_create'){
    groups=[...groups,{id:'group-new',name:String(args.p_name),member_ids:[],created_at:'2026-10-29T00:00:00Z'}];
    return Promise.resolve('group-new');
  }
  if(name==='core_team_group_rename'){
    groups=groups.map(group=>group.id===args.p_team?{...group,name:String(args.p_name)}:group);
    return Promise.resolve(null);
  }
  if(name==='core_team_group_delete'){
    groups=groups.filter(group=>group.id!==args.p_team);
    return Promise.resolve(null);
  }
  if(name==='core_team_group_set_members'){
    groups=groups.map(group=>group.id===args.p_team?{...group,member_ids:[...(args.p_users as string[])]}:group);
    return Promise.resolve(null);
  }
  if(name==='core_team_group_add_member'){
    groups=groups.map(group=>group.id===args.p_team?{...group,member_ids:[...new Set([...group.member_ids,String(args.p_user)])]}:group);
    return Promise.resolve(null);
  }
  if(name==='core_team_group_remove_member'){
    groups=groups.map(group=>group.id===args.p_team?{...group,member_ids:group.member_ids.filter(id=>id!==args.p_user)}:group);
    return Promise.resolve(null);
  }
  return Promise.resolve(null);
}

describe('Grupos da equipe',()=>{
  beforeEach(()=>{
    groups=[{id:'group-sdr',name:'Equipe SDR',member_ids:['user-2'],created_at:'2026-10-28T00:00:00Z'}];
    request.mockReset().mockImplementation(respond);
    invokeFunction.mockReset();
    rpc.mockReset().mockImplementation(rpcRespond);
  });

  it('lista os grupos persistidos e seus membros',async()=>{
    render(<TeamPage/>);
    const group=await screen.findByRole('article',{name:'Equipe SDR'});
    expect(within(group).getByText('Bruno SDR')).toBeInTheDocument();
    expect(within(group).getByText('1 membro')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('core_team_groups',{w:'workspace-1'});
  });

  it('cria e renomeia uma equipe',async()=>{
    const user=userEvent.setup();
    render(<TeamPage/>);
    await screen.findByText('Equipe SDR');
    await user.click(screen.getByRole('button',{name:'Criar equipe'}));
    await user.type(screen.getByLabelText('Nome da equipe'),'Equipe Closers');
    await user.click(screen.getByRole('button',{name:'Salvar equipe'}));
    expect(rpc).toHaveBeenCalledWith('core_team_group_create',{w:'workspace-1',p_name:'Equipe Closers'});
    expect(await screen.findByText('Equipe Closers')).toBeInTheDocument();

    await user.click(screen.getByRole('button',{name:'Editar Equipe Closers'}));
    await user.clear(screen.getByLabelText('Nome da equipe'));
    await user.type(screen.getByLabelText('Nome da equipe'),'Equipe Vendedores');
    await user.click(screen.getByRole('button',{name:'Salvar equipe'}));
    expect(rpc).toHaveBeenCalledWith('core_team_group_rename',{w:'workspace-1',p_team:'group-new',p_name:'Equipe Vendedores'});
    expect(await screen.findByText('Equipe Vendedores')).toBeInTheDocument();
  });

  it('adiciona e remove membros da equipe',async()=>{
    const user=userEvent.setup();
    render(<TeamPage/>);
    await screen.findByText('Equipe SDR');
    await user.click(screen.getByRole('button',{name:'Gerenciar membros de Equipe SDR'}));
    const ana=screen.getByRole('checkbox',{name:/Ana Admin/});
    const bruno=screen.getByRole('checkbox',{name:/Bruno SDR/});
    expect(bruno).toBeChecked();
    await user.click(ana);
    await user.click(bruno);
    await user.click(screen.getByRole('button',{name:'Salvar membros'}));
    expect(rpc).toHaveBeenCalledWith('core_team_group_set_members',{w:'workspace-1',p_team:'group-sdr',p_users:['user-1']});
    await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Membros de Equipe SDR'})).not.toBeInTheDocument());
    const group=screen.getByRole('article',{name:'Equipe SDR'});
    expect(within(group).getByText('Ana Admin')).toBeInTheDocument();
    expect(within(group).queryByText('Bruno SDR')).not.toBeInTheDocument();
  });

  it('exclui uma equipe sem excluir os usuários',async()=>{
    const user=userEvent.setup();
    render(<TeamPage/>);
    await screen.findByText('Equipe SDR');
    await user.click(screen.getByRole('button',{name:'Excluir Equipe SDR'}));
    await user.click(screen.getByRole('button',{name:'Confirmar exclusão da equipe'}));
    expect(rpc).toHaveBeenCalledWith('core_team_group_delete',{w:'workspace-1',p_team:'group-sdr'});
    await waitFor(()=>expect(screen.queryByText('Equipe SDR')).not.toBeInTheDocument());
    expect(screen.getByText('Bruno SDR')).toBeInTheDocument();
  });
});
