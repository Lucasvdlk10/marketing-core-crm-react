import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {ReportsPage} from '../pages/ReportsPage';

const exports=vi.hoisted(()=>({csv:vi.fn(),xlsx:vi.fn(),pdf:vi.fn()}));
vi.mock('../lib/exportReport',()=>({exportCsv:exports.csv,exportXlsx:exports.xlsx,exportPdf:exports.pdf}));

describe('ReportsPage',()=>{
  beforeEach(()=>{exports.csv.mockReset();exports.xlsx.mockReset();exports.pdf.mockReset()});
  it('abre na visão executiva e permite alternar para presença',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);
    expect(screen.getByRole('heading',{name:'Relatórios executivos'})).toBeInTheDocument();
    expect(document.querySelector('.report-tabs')).toBeInTheDocument();
    expect(document.querySelectorAll('.executive-metrics article')).toHaveLength(4);
    expect(document.querySelector('.executive-report-grid')).toBeInTheDocument();
    expect(screen.getByText('Distribuição do funil')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Presença da equipe'}));
    expect(screen.getByRole('heading',{name:'Relatório de presença'})).toBeInTheDocument();
    expect(screen.getByText('Camila Andrade')).toBeInTheDocument();
  });

  it('permite alterar o período do relatório de presença',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);
    await user.click(screen.getByRole('button',{name:'Presença da equipe'}));
    await user.selectOptions(screen.getByRole('combobox',{name:'Período do relatório'}),'30');
    expect(screen.getAllByText('30 dias').length).toBeGreaterThan(0);
  });

  it('abre os relatórios de motivos de perda e tarefas',async()=>{const user=userEvent.setup();render(<ReportsPage/>);await user.click(screen.getByRole('button',{name:'Motivos de perda'}));expect(screen.getByRole('heading',{name:'Relatório de motivos de perda'})).toBeInTheDocument();expect(screen.getByText('Distribuição dos motivos')).toBeInTheDocument();expect(screen.getByText('Impacto financeiro')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Tarefas'}));expect(screen.getByRole('heading',{name:'Relatório de tarefas'})).toBeInTheDocument();expect(screen.getByText('Situação das tarefas')).toBeInTheDocument();expect(screen.getByText('Desempenho por responsável')).toBeInTheDocument()});

  it('oferece exportação em PDF, XLSX e CSV',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);
    await user.click(screen.getByRole('button',{name:'Exportar relatório'}));
    expect(screen.getByRole('button',{name:'Exportar PDF'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Exportar XLSX'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Exportar CSV'})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Exportar CSV'}));
    expect(exports.csv).toHaveBeenCalledWith(expect.objectContaining({title:expect.stringContaining('Relatórios executivos'),headers:expect.any(Array),rows:expect.any(Array)}),expect.stringMatching(/^relatorio-executivo-/));
  });

  it('aplica o período selecionado aos dados e à exportação',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);
    await user.selectOptions(screen.getByRole('combobox',{name:'Período do relatório'}),'30');
    await user.click(screen.getByRole('button',{name:'Exportar relatório'}));
    await user.click(screen.getByRole('button',{name:'Exportar PDF'}));
    expect(exports.pdf).toHaveBeenCalledWith(expect.objectContaining({title:expect.stringContaining('30 dias')}),expect.stringContaining('30-dias'));
  });
});
