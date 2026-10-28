import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it} from 'vitest';
import {TeamPage} from '../pages/TeamPage';

describe('TeamPage administração',()=>{
  beforeEach(()=>localStorage.removeItem('marketing_core_access_roles'));
  it('usa uma função selecionável configurada pelo administrador',async()=>{const user=userEvent.setup();render(<TeamPage preview/>);await user.click(screen.getByRole('button',{name:'Editar Camila Andrade'}));expect(screen.getByLabelText('Função do membro')).toHaveValue('Gestora comercial');await user.selectOptions(screen.getByLabelText('Função do membro'),'SDR');await user.click(screen.getByRole('button',{name:'Salvar alterações'}));expect(screen.getAllByText('SDR').length).toBeGreaterThan(0)});
  it('permite editar membro e solicitar redefinição de senha',async()=>{
    const user=userEvent.setup();render(<TeamPage preview/>);
    await user.click(screen.getByRole('button',{name:'Editar Camila Andrade'}));
    expect(screen.getByRole('dialog',{name:'Editar membro'})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Enviar e-mail de redefinição'}));
    expect(screen.getByRole('status')).toHaveTextContent('E-mail de redefinição solicitado');
  });

  it('inativa um usuário com motivo, período e redistribuição dos leads ativos',async()=>{
    const user=userEvent.setup();render(<TeamPage preview/>);
    await user.click(screen.getByRole('button',{name:'Inativar Camila Andrade'}));
    expect(screen.getByRole('dialog',{name:'Inativar membro'})).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Motivo da inativação'),'Férias');
    await user.type(screen.getByLabelText('Inativo até'),'2026-11-10');
    await user.selectOptions(screen.getByLabelText('Redistribuir leads ativos para'),'member-2');
    await user.click(screen.getByRole('button',{name:'Confirmar inativação'}));
    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });

  it('abre a configuração dos motivos de inativação',async()=>{
    const user=userEvent.setup();render(<TeamPage preview/>);
    await user.click(screen.getByRole('button',{name:'Configurar motivos'}));
    expect(screen.getByRole('dialog',{name:'Configurar motivos de inativação'})).toBeInTheDocument();
  });
});
