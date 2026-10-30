import {describe,expect,it} from 'vitest';
import {buildLossReport,getCalendarPeriodRange} from '../lib/lossReportData';

const deals=[
  {id:'old-deal',contact_id:'lead-1',name:'Projeto A',value:'2000',status:'lost',loss_reason:'Preço/orçamento',created_at:'2026-09-01T10:00:00-03:00',updated_at:'2026-10-30T11:00:00-03:00'},
  {id:'second-deal',contact_id:'lead-2',name:'Projeto B',value:'500',status:'lost',loss_reason:'Preço/orçamento',created_at:'2026-10-29T10:00:00-03:00',updated_at:'2026-10-29T12:00:00-03:00'},
  {id:'open-deal',contact_id:'lead-3',name:'Projeto C',value:'900',status:'open',loss_reason:'Sem retorno',created_at:'2026-10-30T10:00:00-03:00',updated_at:'2026-10-30T10:00:00-03:00'},
];
const contacts=[{id:'lead-1',name:'Lead antigo'},{id:'lead-2',name:'Lead recente'}];

describe('relatório de motivos de perda',()=>{
  it('usa a data da perda, agrupa leads reais, inclui motivos cadastrados sem perdas e soma o impacto do período',()=>{
    const report=buildLossReport(deals,contacts,['Preço/orçamento','Sem retorno','Concorrente'],'2026-10-30','2026-10-30');
    expect(report.totalLeads).toBe(1);
    expect(report.impact).toBe(2000);
    expect(report.rows).toEqual([
      {reason:'Preço/orçamento',count:1,percent:100,leads:[{id:'lead-1',dealId:'old-deal',name:'Lead antigo',dealName:'Projeto A',value:2000}]},
      {reason:'Concorrente',count:0,percent:0,leads:[]},
      {reason:'Sem retorno',count:0,percent:0,leads:[]},
    ]);
  });

  it('conta um lead uma vez por motivo, mas agrega o valor de todas as negociações perdidas desse lead',()=>{
    const report=buildLossReport([...deals,{...deals[0],id:'extra-deal',name:'Projeto adicional',value:'500'}],contacts,['Preço/orçamento'],'2026-10-30','2026-10-30');
    expect(report.totalLeads).toBe(1);
    expect(report.rows[0]).toMatchObject({count:1,leads:[{id:'lead-1',dealName:'Projeto A, Projeto adicional',value:2500}]});
    expect(report.impact).toBe(2500);
  });

  it('usa limites de calendário corretos para hoje, ontem, meses e últimos N dias',()=>{
    const today=new Date(2026,9,30,12,0,0);
    expect(getCalendarPeriodRange('today',today)).toEqual({from:'2026-10-30',to:'2026-10-30'});
    expect(getCalendarPeriodRange('yesterday',today)).toEqual({from:'2026-10-29',to:'2026-10-29'});
    expect(getCalendarPeriodRange('7',today)).toEqual({from:'2026-10-24',to:'2026-10-30'});
    expect(getCalendarPeriodRange('month',today)).toEqual({from:'2026-10-01',to:'2026-10-30'});
    expect(getCalendarPeriodRange('previous-month',today)).toEqual({from:'2026-09-01',to:'2026-09-30'});
  });
});
