import {render,screen,waitFor} from '@testing-library/react';
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
  {workspace_id:'workspace-1',user_id:'master-1',role:'owner',active:true,joined_at:'2026-09-01T00:00:00Z'},
  {workspace_id:'workspace-1',user_id:'user-1',role:'admin',active:true,joined_at:'2026-10-01T00:00:00Z'},
  {workspace_id:'workspace-1',user_id:'user-2',role:'sdr',active:true,joined_at:'2026-10-02T00:00:00Z'},
];
const invitations=[
  {id:'invite-1',workspace_id:'workspace-1',email:'pending@example.com',role:'closer',status:'pending',expires_at:'2026-11-04T00:00:00Z',created_at:'2026-10-28T00:00:00Z'},
];

function respond(path:string){
  if(path.includes('core_memberships'))return Promise.resolve(memberships);
  if(path.includes('core_invitations'))return Promise.resolve(invitations);
  return Promise.reject(new Error(`unexpected ${path}`));
}

describe('TeamPage autenticada',()=>{
  beforeEach(()=>{request.mockReset().mockImplementation(respond);invokeFunction.mockReset();rpc.mockReset().mockImplementation((name:string)=>name==='core_team_member_directory'?Promise.resolve([
    {user_id:'master-1',full_name:'Lucas Master',email:'lucas@example.com'},
    {user_id:'user-1',full_name:'Ana Admin',email:'ana@example.com'},
    {user_id:'user-2',full_name:'Bruno SDR',email:'bruno@example.com'},
  ]):Promise.resolve(null))});

  it('lista membros reais e convites pendentes sem transformar convite em membro ativo',async()=>{
    render(<TeamPage/>);
    expect(await screen.findByText('Ana Admin')).toBeInTheDocument();
    expect(screen.queryByText('Lucas Master')).not.toBeInTheDocument();
    expect(screen.queryByText('lucas@example.com')).not.toBeInTheDocument();
    expect(screen.getByText('Bruno SDR')).toBeInTheDocument();
    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getAllByText('Ativo')).toHaveLength(2);
    expect(request).toHaveBeenCalledWith(expect.stringContaining('core_memberships?select=workspace_id,user_id,role,active,joined_at'));
    expect(request).toHaveBeenCalledWith(expect.stringContaining('core_invitations?select=id,workspace_id,email,role,status,expires_at,created_at'));
  });

  it('aguarda a Edge Function e recarrega o convite retornado pelo provedor',async()=>{
    const user=userEvent.setup();
    let resolveInvite:(value:unknown)=>void=()=>{};
    invokeFunction.mockReturnValue(new Promise(resolve=>{resolveInvite=resolve}));
    render(<TeamPage/>);
    await screen.findByText('Ana Admin');
    await user.click(screen.getByRole('button',{name:'Convidar membro'}));
    await user.type(screen.getByLabelText('E-mail'),'carla@example.com');
    await user.selectOptions(screen.getByLabelText('Função do novo membro'),'closer');
    await user.click(screen.getByRole('button',{name:'Enviar convite'}));
    expect(invokeFunction).toHaveBeenCalledWith('core-invite-member',{workspace_id:'workspace-1',email:'carla@example.com',role:'closer',action:'invite'});
    expect(screen.getByRole('button',{name:'Enviando…'})).toBeDisabled();

    request.mockImplementation(path=>path.includes('core_memberships')?Promise.resolve(memberships):Promise.resolve([...invitations,{id:'invite-2',workspace_id:'workspace-1',email:'carla@example.com',role:'closer',status:'pending',expires_at:'2026-11-04T00:00:00Z',created_at:'2026-10-28T01:00:00Z'}]));
    resolveInvite({ok:true,invitation_id:'invite-2',delivery:'auth_email'});
    expect(await screen.findByText('carla@example.com')).toBeInTheDocument();
    await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Convidar membro'})).not.toBeInTheDocument());
  });

  it('mantém o erro do provedor visível e o formulário aberto',async()=>{
    const user=userEvent.setup();
    invokeFunction.mockRejectedValue(new Error('Workspace seat limit reached'));
    render(<TeamPage/>);
    await screen.findByText('Ana Admin');
    await user.click(screen.getByRole('button',{name:'Convidar membro'}));
    await user.type(screen.getByLabelText('E-mail'),'carla@example.com');
    await user.click(screen.getByRole('button',{name:'Enviar convite'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Workspace seat limit reached');
    expect(screen.getByRole('dialog',{name:'Convidar membro'})).toBeInTheDocument();
  });

  it('revoga convite pendente pelo contrato existente e o remove após recarregar',async()=>{
    const user=userEvent.setup();
    invokeFunction.mockResolvedValue({ok:true});
    render(<TeamPage/>);
    await screen.findByText('pending@example.com');
    request.mockImplementation(path=>path.includes('core_memberships')?Promise.resolve(memberships):Promise.resolve([]));
    await user.click(screen.getByRole('button',{name:'Revogar convite pending@example.com'}));
    expect(invokeFunction).toHaveBeenCalledWith('core-invite-member',{action:'revoke_invite',invitation_id:'invite-1'});
    await waitFor(()=>expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument());
  });

  it('exibe identidade real e persiste edição e inativação no backend',async()=>{
    const user=userEvent.setup();
    render(<TeamPage/>);
    expect(await screen.findByText('Ana Admin')).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Editar Ana Admin'}));
    await user.clear(screen.getByLabelText('Nome do membro'));
    await user.type(screen.getByLabelText('Nome do membro'),'Ana Atualizada');
    await user.selectOptions(screen.getByLabelText('Função do membro'),'closer');
    await user.click(screen.getByRole('button',{name:'Salvar alterações'}));
    expect(rpc).toHaveBeenCalledWith('core_team_update_member_profile',{w:'workspace-1',p_user:'user-1',p_full_name:'Ana Atualizada',p_role:'closer',p_active:true});

    await user.click(screen.getByRole('button',{name:'Inativar Bruno SDR'}));
    await user.click(screen.getByRole('button',{name:'Confirmar inativação'}));
    expect(rpc).toHaveBeenCalledWith('core_team_update_member_profile',{w:'workspace-1',p_user:'user-2',p_full_name:'Bruno SDR',p_role:'sdr',p_active:false});
  });
});
