import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const {signIn,updatePassword,getSession}=vi.hoisted(()=>({signIn:vi.fn(),updatePassword:vi.fn(),getSession:vi.fn()}));
vi.mock('../lib/api',()=>({crmApi:{signIn,updatePassword,getSession}}));
vi.mock('../lib/workspaceSettings',()=>({
  loadRemoteCommercialSettings:vi.fn().mockResolvedValue({lossReasons:[],dealActions:[]}),
  loadRemoteAccessRoles:vi.fn().mockResolvedValue([]),
  saveRemoteCommercialSetting:vi.fn(),
  saveRemoteAccessRoles:vi.fn(),
  isRemoteRolePermissionAvailable:vi.fn().mockReturnValue(true),
}));

import {SettingsPage,type CompanyProfile} from '../pages/SettingsPage';

const profile:CompanyProfile={name:'Marketing Core',tagline:'Estratégia',logoUrl:'./assets/core-mark.svg'};

describe('alteração autenticada de senha nas configurações',()=>{
  beforeEach(()=>{
    signIn.mockReset().mockResolvedValue({});
    updatePassword.mockReset().mockResolvedValue({});
    getSession.mockReset().mockReturnValue({user:{email:'lucas@example.com'}});
  });

  it('reautentica no Supabase e só então atualiza a senha',async()=>{
    const user=userEvent.setup();
    render(<SettingsPage authenticated profile={profile} onSave={async next=>next}/>);
    await user.type(screen.getByLabelText('Senha atual'),'senha-atual');
    await user.type(screen.getByLabelText('Nova senha'),'nova-senha-segura');
    await user.type(screen.getByLabelText('Confirmar nova senha'),'nova-senha-segura');
    await user.click(screen.getByRole('button',{name:'Alterar senha'}));
    expect(signIn).toHaveBeenCalledWith('lucas@example.com','senha-atual');
    expect(updatePassword).toHaveBeenCalledWith('nova-senha-segura');
    expect(await screen.findByText('Senha alterada com sucesso.')).toBeInTheDocument();
  });

  it('bloqueia senhas divergentes antes de chamar o Supabase',async()=>{
    const user=userEvent.setup();
    render(<SettingsPage authenticated profile={profile} onSave={async next=>next}/>);
    await user.type(screen.getByLabelText('Senha atual'),'senha-atual');
    await user.type(screen.getByLabelText('Nova senha'),'nova-senha-segura');
    await user.type(screen.getByLabelText('Confirmar nova senha'),'outra-senha');
    await user.click(screen.getByRole('button',{name:'Alterar senha'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('As novas senhas não coincidem.');
    expect(signIn).not.toHaveBeenCalled();
    expect(updatePassword).not.toHaveBeenCalled();
  });
});
