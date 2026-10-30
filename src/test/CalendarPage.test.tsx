import {fireEvent,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {CalendarPage} from '../pages/CalendarPage';

describe('CalendarPage',()=>{
  beforeEach(()=>{window.location.hash='';localStorage.removeItem('marketing_core_scheduled_deal_actions');localStorage.removeItem('marketing_core_calendar_task_records');localStorage.removeItem('marketing_core_deleted_calendar_tasks');vi.setSystemTime(new Date(2026,9,23,12,0,0))});
  afterEach(()=>vi.useRealTimers());

  it('carrega o mês atual com dias e compromissos no modo de visualização',()=>{
    vi.useFakeTimers();
    render(<CalendarPage preview/>);

    expect(screen.getByRole('heading',{name:'Outubro de 2026'})).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getAllByText('Fazer primeiro contato').length).toBeGreaterThan(0);
    expect(screen.queryByText('Calendário pronto para sincronizar')).not.toBeInTheDocument();
  });
  it('lista no calendário uma próxima ação agendada da negociação',()=>{localStorage.setItem('marketing_core_scheduled_deal_actions',JSON.stringify([{dealId:'deal-1',dealName:'Contrato anual',leadId:'lead-1',leadName:'Cliente Teste',company:'Empresa',action:'Enviar proposta',date:'2026-10-23'}]));render(<CalendarPage/>);expect(screen.getByText('Enviar proposta')).toBeInTheDocument();expect(screen.getByText('Cliente Teste')).toBeInTheDocument()});
  it('exige data futura, horário e responsável selecionado ao criar tarefa',async()=>{const user=userEvent.setup();render(<CalendarPage preview/>);await user.click(screen.getByRole('button',{name:'Adicionar tarefa'}));expect(screen.getByLabelText('Data da tarefa')).toHaveAttribute('min','2026-10-23');expect(screen.getByLabelText('Horário da tarefa')).toBeRequired();expect(screen.getByLabelText('Responsável pela tarefa').tagName).toBe('SELECT');expect(screen.getByRole('option',{name:'Camila Andrade'})).toBeInTheDocument();expect(screen.queryByLabelText('Status da tarefa')).not.toBeInTheDocument();await user.type(screen.getByLabelText('Título da tarefa'),'Retorno comercial');await user.clear(screen.getByLabelText('Data da tarefa'));await user.type(screen.getByLabelText('Data da tarefa'),'2026-10-22');await user.type(screen.getByLabelText('Horário da tarefa'),'10:00');await user.selectOptions(screen.getByLabelText('Responsável pela tarefa'),'Camila Andrade');await user.click(screen.getByRole('button',{name:'Salvar tarefa'}));expect(screen.getByText('Não é possível agendar uma tarefa no passado.')).toBeInTheDocument()},10000);
  it('busca leads e empresas e calcula o status pelo prazo',async()=>{localStorage.setItem('marketing_core_calendar_task_records',JSON.stringify([{id:'late-task',title:'Contato atrasado',date:'2026-10-22',time:'10:00',leadName:'Bruno Barbosa',company:'Lumina Saúde',assignee:'Camila Andrade',priority:'Média',status:'Pendente',notes:'',source:'manual'}]));const user=userEvent.setup();render(<CalendarPage preview/>);await user.click(screen.getByRole('button',{name:'Adicionar tarefa'}));await user.type(screen.getByLabelText('Lead ou contato'),'Bruno');expect(document.querySelector('#calendar-leads option[value*="Bruno"]')).not.toBeNull();await user.clear(screen.getByLabelText('Empresa da tarefa'));await user.type(screen.getByLabelText('Empresa da tarefa'),'Lumina');expect(document.querySelector('#calendar-companies option[value="Lumina Saúde"]')).not.toBeNull();await user.click(screen.getByLabelText('Fechar formulário da tarefa'));await user.click(screen.getByRole('button',{name:/Contato atrasado/}));expect(screen.getByText('Atrasada')).toBeInTheDocument()});
  it('adiciona, conclui, edita e exclui uma tarefa do calendário',async()=>{const user=userEvent.setup();render(<CalendarPage preview/>);await user.click(screen.getByRole('button',{name:'Adicionar tarefa'}));await user.type(screen.getByLabelText('Título da tarefa'),'Revisar proposta comercial');await user.type(screen.getByLabelText('Horário da tarefa'),'14:30');await user.selectOptions(screen.getByLabelText('Responsável pela tarefa'),'Camila Andrade');await user.click(screen.getByRole('button',{name:'Salvar tarefa'}));await user.click(screen.getByRole('button',{name:/Revisar proposta comercial/}));expect(screen.getByRole('dialog',{name:'Detalhes da tarefa Revisar proposta comercial'})).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Concluir tarefa'}));expect(screen.getByText('Concluída')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Editar'}));const title=screen.getByLabelText('Título da tarefa');await user.clear(title);await user.type(title,'Revisar proposta atualizada');await user.click(screen.getByRole('button',{name:'Salvar tarefa'}));expect(screen.getByRole('dialog',{name:'Detalhes da tarefa Revisar proposta atualizada'})).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Excluir'}));expect(screen.queryByText('Revisar proposta atualizada')).not.toBeInTheDocument()},10000);
  it('alterna entre as visualizações de mês, semana e dia',async()=>{
    vi.useFakeTimers();
    render(<CalendarPage preview/>);
    expect(screen.getByRole('tab',{name:'Mês'})).toHaveAttribute('aria-selected','true');
    fireEvent.click(screen.getByRole('tab',{name:'Semana'}));
    expect(screen.getByRole('heading',{name:'18 a 24 de outubro de 2026'})).toBeInTheDocument();
    expect(screen.getByRole('region',{name:'Visualização semanal do calendário'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab',{name:'Dia'}));
    expect(screen.getByRole('heading',{name:'23 de outubro de 2026'})).toBeInTheDocument();
    expect(screen.getByRole('region',{name:'Visualização diária do calendário'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Próximo dia'}));
    expect(screen.getByRole('heading',{name:'24 de outubro de 2026'})).toBeInTheDocument();
  });

  it('abre automaticamente o compromisso indicado pela notificação',()=>{window.location.hash='#/calendar?event=task-3';render(<CalendarPage preview/>);expect(screen.getByRole('dialog',{name:'Detalhes da tarefa Agendar reunião de diagnóstico'})).toBeInTheDocument()});
});
