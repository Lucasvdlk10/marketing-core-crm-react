import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const {rpc,signIn,updatePassword,getSession}=vi.hoisted(()=>({
  rpc:vi.fn(),signIn:vi.fn(),updatePassword:vi.fn(),getSession:vi.fn()
}));
vi.mock('../lib/remoteCrm',()=>({remoteRpc:rpc}));
vi.mock('../lib/api',()=>({crmApi:{signIn,updatePassword,getSession}}));

import {ProfilePage} from '../pages/ProfilePage';

describe('ProfilePage',()=>{
  beforeEach(()=>{
    rpc.mockReset();signIn.mockReset();updatePassword.mockReset();
    getSession.mockReturnValue({user:{email:'employee@example.com'}});
    vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:512,height:512,close:vi.fn()}));
    rpc.mockImplementation(async(name:string)=>name==='core_my_profile_get'?{
      user_id:'user-1',full_name:'Pessoa Remota',phone:'31999990000',job_title:'SDR',avatar_data:null,updated_at:'2026-10-28T00:00:00Z'
    }:{});
  });

  it('loads and saves the authenticated user profile through its RPC',async()=>{
    const saved={user_id:'user-1',full_name:'Marina Souza',phone:'31988887777',job_title:'Closer',avatar_data:null,updated_at:'2026-10-28T01:00:00Z'};
    rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>name==='core_my_profile_get'?{
      user_id:'user-1',full_name:'Pessoa Remota',phone:'31999990000',job_title:'SDR',avatar_data:null,updated_at:'2026-10-28T00:00:00Z'
    }:name==='core_my_profile_save'?saved:{});
    const onSaved=vi.fn();const user=userEvent.setup();
    render(<ProfilePage onSaved={onSaved}/>);
    const name=await screen.findByLabelText('Nome completo');
    await user.clear(name);await user.type(name,'Marina Souza');
    const phone=screen.getByLabelText('Telefone');await user.clear(phone);await user.type(phone,'31988887777');
    const job=screen.getByLabelText('Cargo');await user.clear(job);await user.type(job,'Closer');
    await user.click(screen.getByRole('button',{name:'Salvar perfil'}));
    expect(rpc).toHaveBeenCalledWith('core_my_profile_save',{p_full_name:'Marina Souza',p_phone:'31988887777',p_job_title:'Closer',p_avatar_data:null});
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(screen.getByText('Perfil atualizado com sucesso.')).toBeInTheDocument();
  });

  it('shows an immediate thumbnail preview for the selected avatar',async()=>{
    const user=userEvent.setup();render(<ProfilePage/>);
    await screen.findByLabelText('Nome completo');
    const file=new File(['avatar'],'avatar.png',{type:'image/png'});
    await user.upload(screen.getByLabelText('Foto de perfil'),file);
    await waitFor(()=>expect(screen.getByRole('img',{name:'Prévia da foto de perfil'})).toHaveAttribute('src',expect.stringMatching(/^data:image\/png;base64,/)));
  });

  it('shows discreet avatar requirements and translates the database size error',async()=>{
    rpc.mockImplementation(async(name:string)=>name==='core_my_profile_get'?{user_id:'user-1',full_name:'Pessoa Remota',phone:null,job_title:null,avatar_data:null,updated_at:null}:Promise.reject(new Error('new row violates check constraint core_user_profiles_avatar_data_size')));
    const user=userEvent.setup();render(<ProfilePage/>);await screen.findByLabelText('Nome completo');
    expect(screen.getByRole('tooltip')).toHaveTextContent('JPG, PNG ou WebP');
    expect(screen.getByRole('tooltip')).toHaveTextContent('2048×2048');
    await user.click(screen.getByRole('button',{name:'Salvar perfil'}));
    expect(screen.getByRole('alert')).toHaveTextContent('A foto ficou maior que o limite permitido');
  });

  it('reauthenticates with the current password before changing it',async()=>{
    const user=userEvent.setup();render(<ProfilePage/>);await screen.findByLabelText('Nome completo');
    await user.type(screen.getByLabelText('Senha atual'),'senha-atual');
    await user.type(screen.getByLabelText('Nova senha'),'nova-senha-segura');
    await user.type(screen.getByLabelText('Confirmar nova senha'),'nova-senha-segura');
    await user.click(screen.getByRole('button',{name:'Alterar senha'}));
    expect(signIn).toHaveBeenCalledWith('employee@example.com','senha-atual');
    expect(updatePassword).toHaveBeenCalledWith('nova-senha-segura');
    expect(screen.getByText('Senha alterada com sucesso.')).toBeInTheDocument();
  });
});
