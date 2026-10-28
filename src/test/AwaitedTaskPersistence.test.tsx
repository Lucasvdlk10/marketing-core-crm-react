import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocked=vi.hoisted(()=>({saveCalendarTaskRecord:vi.fn(),deleteCalendarTaskRecord:vi.fn()}));
vi.mock('../lib/calendarTasks',()=>({
  getCalendarTaskRecords:()=>[],
  getDeletedCalendarTasks:()=>[],
  subscribeCalendarTasks:()=>()=>{},
  saveCalendarTaskRecord:mocked.saveCalendarTaskRecord,
  deleteCalendarTaskRecord:mocked.deleteCalendarTaskRecord,
}));

import {TasksPage} from '../pages/TasksPage';
import {CalendarPage} from '../pages/CalendarPage';

const deferred=<T,>()=>{let resolve!:(value:T)=>void;let reject!:(reason?:unknown)=>void;const promise=new Promise<T>((res,rej)=>{resolve=res;reject=rej});return{promise,resolve,reject}};

async function fillTaskForm(user:ReturnType<typeof userEvent.setup>){
  await user.type(screen.getByLabelText('Título da tarefa'),'Tarefa persistida');
  const date=screen.getByLabelText('Data da tarefa');
  await user.clear(date);
  await user.type(date,'2099-10-30');
  await user.type(screen.getByLabelText('Horário da tarefa'),'14:30');
  await user.selectOptions(screen.getByLabelText('Responsável pela tarefa'),'Camila Andrade');
}

describe('awaited task persistence UX',()=>{
  beforeEach(()=>{mocked.saveCalendarTaskRecord.mockReset();mocked.deleteCalendarTaskRecord.mockReset();vi.useRealTimers()});

  it('TasksPage waits for persistence and keeps the form open on error',async()=>{
    const pending=deferred<void>();
    mocked.saveCalendarTaskRecord.mockReturnValueOnce(pending.promise);
    const user=userEvent.setup();
    render(<TasksPage preview/>);
    await user.click(screen.getByRole('button',{name:'Nova tarefa'}));
    await fillTaskForm(user);
    await user.click(screen.getByRole('button',{name:'Cadastrar tarefa'}));
    expect(screen.getByRole('button',{name:'Salvando...'})).toBeDisabled();
    expect(screen.getByRole('dialog',{name:'Cadastrar nova tarefa'})).toBeInTheDocument();
    pending.reject(new Error('Falha RLS ao salvar tarefa'));
    expect(await screen.findByText('Falha RLS ao salvar tarefa')).toBeInTheDocument();
    expect(screen.getByRole('dialog',{name:'Cadastrar nova tarefa'})).toBeInTheDocument();
  });

  it('CalendarPage waits for persistence and keeps the form open on error',async()=>{
    const pending=deferred<void>();
    mocked.saveCalendarTaskRecord.mockReturnValueOnce(pending.promise);
    const user=userEvent.setup();
    render(<CalendarPage preview/>);
    await user.click(screen.getByRole('button',{name:'Adicionar tarefa'}));
    await fillTaskForm(user);
    await user.click(screen.getByRole('button',{name:'Salvar tarefa'}));
    expect(screen.getByRole('button',{name:'Salvando...'})).toBeDisabled();
    pending.reject(new Error('Rede indisponível'));
    expect(await screen.findByText('Rede indisponível')).toBeInTheDocument();
    expect(screen.getByRole('dialog',{name:'Adicionar tarefa'})).toBeInTheDocument();
  });
});
