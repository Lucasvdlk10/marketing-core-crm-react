import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it} from 'vitest';
import {AutomationsPage} from '../pages/AutomationsPage';

describe('AutomationsPage',()=>{
  beforeEach(()=>{localStorage.removeItem('marketing_core_automations');localStorage.removeItem('marketing_core_lead_records')});
  it('abre o editor, adiciona etapas e salva a automação na listagem',async()=>{
    const user=userEvent.setup();
    render(<AutomationsPage/>);

    await user.click(screen.getByRole('button',{name:/Nova automação/i}));
    expect(screen.getByRole('heading',{name:'Criar automação'})).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nome da automação'),'Nutrição de leads');
    await user.click(screen.getByRole('button',{name:'Adicionar Enviar e-mail'}));
    await user.click(screen.getByRole('button',{name:'Adicionar Aguardar'}));
    expect(screen.getAllByTestId('automation-node')).toHaveLength(2);

    await user.click(screen.getByRole('button',{name:'Salvar automação'}));
    expect(screen.getByText('Nutrição de leads')).toBeInTheDocument();
    expect(screen.getByText('2 etapas')).toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Criar automação'})).not.toBeInTheDocument();
  });
  it('configura a origem de entrada dos leads no card inicial',async()=>{const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:/Nova automação/i}));await user.click(screen.getByRole('button',{name:'Adicionar Lead entra no fluxo'}));await user.click(screen.getByRole('button',{name:'Configurar origem dos leads'}));expect(screen.getByRole('dialog',{name:'Configurar origem dos leads'})).toBeInTheDocument();await user.selectOptions(screen.getByLabelText('Tipo de origem dos leads'),'wordpress');await user.selectOptions(screen.getByLabelText('Origem específica dos leads'),'wordpress-main');await user.click(screen.getByRole('button',{name:'Salvar origem'}));expect(screen.getByText('Formulário principal do site')).toBeInTheDocument()});
  it('seleciona uma tarefa configurada para o card Criar tarefa',async()=>{const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:/Nova automação/i}));await user.click(screen.getByRole('button',{name:'Adicionar Criar tarefa'}));await user.click(screen.getByRole('button',{name:'Configurar tarefa da automação'}));expect(screen.getByRole('dialog',{name:'Configurar tarefa da automação'})).toBeInTheDocument();await user.selectOptions(screen.getByLabelText('Selecionar tarefa configurada'),'Fazer primeiro contato');await user.click(screen.getByRole('button',{name:'Salvar tarefa'}));expect(screen.getByText('Fazer primeiro contato')).toBeInTheDocument()});
  it('configura o período do card Aguardar',async()=>{const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:/Nova automação/i}));await user.click(screen.getByRole('button',{name:'Adicionar Aguardar'}));await user.click(screen.getByRole('button',{name:'Configurar período de espera'}));expect(screen.getByRole('dialog',{name:'Configurar período de espera'})).toBeInTheDocument();const amount=screen.getByLabelText('Quantidade do período');await user.clear(amount);await user.type(amount,'2');await user.selectOptions(screen.getByLabelText('Unidade do período'),'weeks');await user.click(screen.getByRole('button',{name:'Salvar período'}));expect(screen.getByText('2 semanas')).toBeInTheDocument()});
  it('seleciona a tag que será adicionada pelo fluxo',async()=>{localStorage.setItem('marketing_core_lead_records',JSON.stringify({'lead-1':{lead:{},tags:['VIP'],notes:[]}}));const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:/Nova automação/i}));await user.click(screen.getByRole('button',{name:'Adicionar Adicionar tag'}));await user.click(screen.getByRole('button',{name:'Configurar tag da automação'}));expect(screen.getByRole('dialog',{name:'Configurar tag da automação'})).toBeInTheDocument();await user.selectOptions(screen.getByLabelText('Selecionar tag da automação'),'VIP');await user.click(screen.getByRole('button',{name:'Salvar tag'}));expect(screen.getByText('VIP')).toBeInTheDocument()});
  it('edita uma automação existente e preserva suas etapas',async()=>{localStorage.setItem('marketing_core_automations',JSON.stringify([{id:'automation-1',name:'Fluxo antigo',nodes:[{id:'node-1',kind:'email',label:'Enviar e-mail',x:90,y:80}],connections:[],createdAt:'24/10/2026'}]));const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:'Editar Fluxo antigo'}));expect(screen.getByRole('heading',{name:'Editar automação'})).toBeInTheDocument();expect(screen.getAllByTestId('automation-node')).toHaveLength(1);const name=screen.getByLabelText('Nome da automação');await user.clear(name);await user.type(name,'Fluxo atualizado');await user.click(screen.getByRole('button',{name:'Salvar alterações'}));expect(screen.getByText('Fluxo atualizado')).toBeInTheDocument();expect(screen.queryByText('Fluxo antigo')).not.toBeInTheDocument()});
  it('exclui uma automação após confirmação',async()=>{localStorage.setItem('marketing_core_automations',JSON.stringify([{id:'automation-1',name:'Fluxo descartável',nodes:[{id:'node-1',kind:'email',label:'Enviar e-mail',x:90,y:80}],connections:[],createdAt:'24/10/2026'}]));const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:'Excluir Fluxo descartável'}));expect(screen.getByRole('dialog',{name:'Excluir automação'})).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Confirmar exclusão'}));expect(screen.queryByText('Fluxo descartável')).not.toBeInTheDocument();expect(screen.getByText('Nenhuma automação criada')).toBeInTheDocument()});
});
