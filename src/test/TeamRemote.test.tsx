import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const {request,invokeFunction}=vi.hoisted(()=>({request:vi.fn(),invokeFunction:vi.fn()}));
vi.mock('../lib/api',()=>({crmApi:{request,invokeFunction,recover:vi.fn()}}));
vi.mock('../lib/remoteCrm',()=>({
  getRemoteWorkspaceId:()=> 'workspace-1',
  getRemoteSnapshot:()=>({members:[{user_id:'user-1',full_name:'Ana Admin'},{user_id:'user-2',full_name:'Bruno SDR'}]}),
}));

import {TeamPage} from '../pages/TeamPage';

const memberships=[
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
  beforeEach(()=>{request.mockReset().mockImplementation(respond);invokeFunction.mockReset()});

  it('lista membros reais e convites pendentes sem transformar convite em membro ativo',async()=>{
    render(<TeamPage/>);
    expect(await screen.findByText('Ana Admin')).toBeInTheDocument();
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
});
