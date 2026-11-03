import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {ReportsPage} from '../pages/ReportsPage';

const mocks=vi.hoisted(()=>({
  remote:true,workspace:'workspace-reports',read:vi.fn(),write:vi.fn(),csv:vi.fn(),xlsx:vi.fn(),pdf:vi.fn(),
  snapshot:{workspace:{id:'workspace-reports',name:'Marketing Core'},membership:{role:'owner'},rolePermissions:[],summary:null,contacts:[],deals:[],stages:[],pipelines:[],teamGroups:[{id:'team-one',name:'Equipe Alfa',member_ids:['user-1']}],members:[{user_id:'user-1',full_name:'Ana Silva'},{user_id:'user-2',full_name:'Bruno Lima'}],tasks:[],tags:[],contactTags:[],notifications:[],campaigns:[],segmentLists:[],segmentMembers:[],automations:[],importHistory:[]},
}));
vi.mock('../lib/exportReport',()=>({exportCsv:mocks.csv,exportXlsx:mocks.xlsx,exportPdf:mocks.pdf}));
vi.mock('../lib/remoteCrm',()=>({isRemoteMode:()=>mocks.remote,getRemoteWorkspaceId:()=>mocks.workspace,remoteRpc:(name:string,args:unknown)=>mocks.write(name,args),remoteReadRpc:(name:string,args:unknown)=>mocks.read(name,args)}));
vi.mock('../lib/useRemoteSnapshot',()=>({useRemoteSnapshot:()=>mocks.snapshot}));
vi.mock('../lib/workspaceSettings',()=>({loadRemoteCommercialSettings:async()=>({lossReasons:['Preço','Sem perfil']})}));
vi.mock('../data/mockCrmData',()=>({mockLeads:[],mockOpportunities:[],mockTasks:[],memberWorkload:[]}));

const lossRows=[{reason:'Sem motivo informado',deal_count:2,lead_count:2,total_value:2000},{reason:'Preço',deal_count:1,lead_count:1,total_value:1000}];
const lossUserReasons=[{user_id:'user-1',reason:'Sem motivo informado',deal_count:2},{user_id:'user-2',reason:'Preço',deal_count:1}];
const lossDetails=[
  {deal_id:'deal-no-reason',contact_id:'contact-1',lead_name:'Lead sem motivo',contact_notes:null,deal_name:'Projeto Aurora',deal_notes:null,loss_reason:null,lost_at:'2026-10-12T12:00:00.000Z',value:1200,loss_marked_by:'user-1',loss_reason_requested_at:null},
  {deal_id:'deal-with-note',contact_id:'contact-2',lead_name:'Lead com observação',contact_notes:'Já pediu retorno no próximo trimestre.',deal_name:'Projeto Boreal',deal_notes:'Acompanhar decisão comercial no próximo mês.',loss_reason:null,lost_at:'2026-10-13T12:00:00.000Z',value:800,loss_marked_by:'user-2',loss_reason_requested_at:null},
];
const taskMetrics=[
  {metric_kind:'assigned',user_id:'user-1',full_name:'Ana Silva',task_type:'call',task_count:4,pending_count:2},
  {metric_kind:'assigned',user_id:'user-1',full_name:'Ana Silva',task_type:'meeting',task_count:2,pending_count:1},
  {metric_kind:'completed',user_id:'user-1',full_name:'Ana Silva',task_type:'call',task_count:3,pending_count:0},
  {metric_kind:'completed',user_id:'user-2',full_name:'Bruno Lima',task_type:'meeting',task_count:2,pending_count:0},
];
const originRows=[{source:'Instagram',lead_count:6},{source:'Indicação',lead_count:4}];

beforeEach(()=>{
  mocks.remote=true;mocks.workspace='workspace-reports';
  mocks.snapshot.teamGroups=[{id:'team-one',name:'Equipe Alfa',member_ids:['user-1']}];
  mocks.snapshot.members=[{user_id:'user-1',full_name:'Ana Silva'},{user_id:'user-2',full_name:'Bruno Lima'}];
  mocks.read.mockReset().mockImplementation(async(name:string,args?:Record<string,unknown>)=>{
    if(name==='core_team_groups')return mocks.snapshot.teamGroups;
    if(name==='core_presence_usage_report_v2'){
      const rows=[
        {user_id:'user-1',full_name:'Ana Silva',status:'online',updated_at:'2026-11-03T12:00:00.000Z',is_online:true,online_seconds:7200,meeting_seconds:600,away_seconds:0,total_seconds:7800,current_online_seconds:3600,team_name:'Equipe Alfa'},
        {user_id:'user-2',full_name:'Bruno Lima',status:'offline',updated_at:'2026-11-03T10:00:00.000Z',is_online:false,online_seconds:3600,meeting_seconds:0,away_seconds:1200,total_seconds:4800,current_online_seconds:0,team_name:'Equipe Beta'},
      ];
      return args?.p_team==='team-one'?rows.filter(row=>row.user_id==='user-1'):args?.p_team==='team-two'?rows.filter(row=>row.user_id==='user-2'):rows;
    }
    if(name==='core_presence_user_detail_v2')return[{status:'online',started_at:'2026-11-03T11:00:00.000Z',ended_at:'2026-11-03T12:00:00.000Z',duration_seconds:3600}];
    if(name==='core_reports_loss_summary')return lossRows;
    if(name==='core_reports_loss_user_reasons')return lossUserReasons;
    if(name==='core_reports_lost_deals_page')return lossDetails.map(row=>({...row,request_allowed:!row.loss_reason&&Boolean(row.loss_marked_by)}));
    if(name==='core_reports_task_analytics')return taskMetrics;
    if(name==='core_reports_leads_by_origin')return originRows;
    return[];
  });
  mocks.write.mockReset().mockResolvedValue({status:'sent',requested_at:'2026-11-03T12:00:00.000Z'});
  mocks.csv.mockReset();mocks.xlsx.mockReset();mocks.pdf.mockReset();
});

const chooseCustomRange=async(user:ReturnType<typeof userEvent.setup>)=>{
  await user.selectOptions(screen.getByRole('combobox',{name:'Período do relatório'}),'custom');
  fireEvent.change(screen.getByLabelText('Data inicial personalizada'),{target:{value:'2026-10-01'}});
  fireEvent.change(screen.getByLabelText('Data final personalizada'),{target:{value:'2026-10-30'}});
};
const localBounds=()=>({p_since:new Date(2026,9,1,0,0,0,0).toISOString(),p_until:new Date(2026,9,31,0,0,0,0).toISOString()});

describe('ReportsPage',()=>{
  it('starts on presence and shows only the four requested reports',()=>{
    render(<ReportsPage/>);
    expect(screen.getByRole('heading',{name:'Relatório de presença'})).toBeInTheDocument();
    expect(screen.getByRole('combobox',{name:'Período do relatório'})).toHaveValue('7');
    expect(screen.queryByRole('tab',{name:'Executivo'})).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab=>tab.textContent)).toEqual(['Presença da equipe','Motivos de perda','Tarefas','Leads por origem']);
  });

  it('keeps the period filter and export action aligned in one shared toolbar',()=>{
    render(<ReportsPage/>);
    const toolbar=document.querySelector('.reports-header-controls');
    expect(toolbar).toContainElement(screen.getByRole('combobox',{name:'Período do relatório'}));
    expect(toolbar).toContainElement(screen.getByRole('button',{name:'Exportar relatório'}));
  });

  it('rejects custom ranges longer than 366 days before requesting report data',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);await screen.findAllByText('Ana Silva');mocks.read.mockClear();
    await user.selectOptions(screen.getByRole('combobox',{name:'Período do relatório'}),'custom');
    fireEvent.change(screen.getByLabelText('Data inicial personalizada'),{target:{value:'2025-09-30'}});
    fireEvent.change(screen.getByLabelText('Data final personalizada'),{target:{value:'2026-10-01'}});
    expect(await screen.findByText(/366 dias/i)).toBeInTheDocument();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:'Exportar relatório'})).toBeDisabled();
  });

  it('applies one custom calendar range to presence, losses, tasks, origins and export',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);await chooseCustomRange(user);const bounds=localBounds();
    await user.click(screen.getByRole('tab',{name:'Motivos de perda'}));
    await waitFor(()=>expect(mocks.read).toHaveBeenCalledWith('core_reports_loss_summary',expect.objectContaining({p_workspace:'workspace-reports',...bounds})));
    await user.click(screen.getByRole('tab',{name:'Tarefas'}));
    await waitFor(()=>expect(mocks.read).toHaveBeenCalledWith('core_reports_task_analytics',expect.objectContaining({p_workspace:'workspace-reports',...bounds})));
    await user.click(screen.getByRole('tab',{name:'Leads por origem'}));
    await waitFor(()=>expect(mocks.read).toHaveBeenCalledWith('core_reports_leads_by_origin',expect.objectContaining({p_workspace:'workspace-reports',...bounds})));
    await user.click(screen.getByRole('tab',{name:'Presença da equipe'}));
    await waitFor(()=>expect(mocks.read).toHaveBeenCalledWith('core_presence_usage_report_v2',expect.objectContaining({p_workspace:'workspace-reports',...bounds})));
    await user.click(screen.getByRole('button',{name:'Exportar relatório'}));await user.click(screen.getByRole('button',{name:'Exportar CSV'}));
    expect(mocks.csv).toHaveBeenCalledWith(expect.objectContaining({title:expect.stringContaining('2026-10-01 a 2026-10-30')}),expect.stringContaining('2026-10-01'));
  });

  it('applies the selected team to presence totals, details and exports',async()=>{
    const user=userEvent.setup();mocks.snapshot.teamGroups=[{id:'team-one',name:'Equipe Alfa',member_ids:['user-1']},{id:'team-two',name:'Equipe Beta',member_ids:['user-2']}];
    render(<ReportsPage/>);await screen.findAllByText('Ana Silva');
    await user.selectOptions(screen.getByRole('combobox',{name:'Equipe do relatório'}),'team-one');
    await waitFor(()=>expect(mocks.read).toHaveBeenCalledWith('core_presence_usage_report_v2',expect.objectContaining({p_team:'team-one'})));
    await waitFor(()=>expect(screen.queryByText('Bruno Lima')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button',{name:'Ver intervalos de presença de Ana Silva'}));
    await waitFor(()=>expect(mocks.read).toHaveBeenCalledWith('core_presence_user_detail_v2',expect.objectContaining({p_user:'user-1',p_team:'team-one'})));
    await user.keyboard('{Escape}');await user.click(screen.getByRole('button',{name:'Exportar relatório'}));await user.click(screen.getByRole('button',{name:'Exportar CSV'}));
    const table=mocks.csv.mock.calls[0]?.[0] as {rows:unknown[][]};
    expect(table.rows.some(row=>row.includes('Ana Silva'))).toBe(true);expect(table.rows.some(row=>row.includes('Bruno Lima'))).toBe(false);
  });

  it('shows the team selector only on the presence tab',async()=>{
    const user=userEvent.setup();mocks.snapshot.teamGroups=[{id:'team-one',name:'Equipe Alfa',member_ids:['user-1']},{id:'team-two',name:'Equipe Beta',member_ids:['user-2']}];
    render(<ReportsPage/>);await screen.findByRole('combobox',{name:'Equipe do relatório'});
    await user.click(screen.getByRole('tab',{name:'Motivos de perda'}));
    expect(screen.queryByRole('combobox',{name:'Equipe do relatório'})).not.toBeInTheDocument();
    await waitFor(()=>expect(mocks.read).toHaveBeenCalledWith('core_reports_loss_summary',expect.objectContaining({p_workspace:'workspace-reports'})));
    const lossCalls=mocks.read.mock.calls.filter((call)=>call[0]==='core_reports_loss_summary');
    expect(lossCalls[lossCalls.length-1]?.[1]).not.toHaveProperty('p_team');
  });

  it('highlights longest online sessions without comparing elapsed time to a work target',async()=>{
    render(<ReportsPage/>);expect((await screen.findAllByText('Ana Silva')).length).toBeGreaterThan(0);
    expect(screen.getByText(/mais tempo online no período/i)).toBeInTheDocument();expect(screen.getByText(/online há mais tempo/i)).toBeInTheDocument();
    expect((await screen.findAllByText('1h 0m')).length).toBeGreaterThan(0);expect(screen.queryByText(/Uso \/ esperado/i)).not.toBeInTheDocument();
  });

  it('shows loss reason rankings by marker and opens a scrollable side drawer with the lead and marker',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);await user.click(screen.getByRole('tab',{name:'Motivos de perda'}));
    expect(await screen.findByText('Motivos mais marcados por pessoa')).toBeInTheDocument();expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:/Sem motivo informado/}));const drawer=await screen.findByRole('dialog',{name:/Sem motivo informado/});
    expect(within(drawer).getByText('Lead sem motivo')).toBeInTheDocument();expect(within(drawer).getByText('Marcado por Ana Silva')).toBeInTheDocument();
    expect(within(drawer).getByText('Lead com observação')).toBeInTheDocument();expect(drawer.querySelector('.loss-lead-list')).toHaveStyle({overflowY:'auto'});
    expect(within(drawer).getByRole('button',{name:'Solicitar motivo para Lead sem motivo'})).toBeInTheDocument();
    expect(within(drawer).getByRole('button',{name:'Solicitar motivo para Lead com observação'})).toBeInTheDocument();
  });

  it('allows requesting a structured reason even when unrelated notes exist',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);await user.click(screen.getByRole('tab',{name:'Motivos de perda'}));
    await user.click(await screen.findByRole('button',{name:/Sem motivo informado/}));const drawer=await screen.findByRole('dialog',{name:/Sem motivo informado/});
    await user.click(within(drawer).getByRole('button',{name:'Solicitar motivo para Lead com observação'}));
    expect(mocks.write).toHaveBeenCalledWith('core_loss_reason_request',{p_workspace:'workspace-reports',p_deal_id:'deal-with-note'});
    await waitFor(()=>expect(within(drawer).getByText(/solicitação enviada/i)).toBeInTheDocument());
  });

  it('segments task workload and completion by call and meeting with distinct rankings',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);await user.click(screen.getByRole('tab',{name:'Tarefas'}));
    expect(await screen.findByText('Tarefas de ligação')).toBeInTheDocument();expect(screen.getByText('Tarefas de reunião')).toBeInTheDocument();
    expect(screen.getByText('Quem recebe mais tarefas')).toBeInTheDocument();expect(screen.getByText('Quem conclui mais tarefas')).toBeInTheDocument();
    expect(screen.getAllByText('Ana Silva').length).toBeGreaterThan(0);expect(screen.getAllByText('Bruno Lima').length).toBeGreaterThan(0);
    expect(screen.getByText(/% das tarefas recebidas/)).toBeInTheDocument();expect(screen.getAllByText(/% das tarefas concluídas/).length).toBeGreaterThan(0);
  });

  it('shows leads by origin as a period-filtered chart and exports its summary',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);await user.click(screen.getByRole('tab',{name:'Leads por origem'}));
    expect(await screen.findByText('Origem dos leads')).toBeInTheDocument();expect(screen.getAllByText('Instagram').length).toBeGreaterThan(0);
    expect(screen.getByText('Indicação')).toBeInTheDocument();expect(screen.getByText('60%')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Exportar relatório'}));await user.click(screen.getByRole('button',{name:'Exportar CSV'}));
    expect(mocks.csv).toHaveBeenCalledWith(expect.objectContaining({headers:expect.arrayContaining(['Origem','Leads','Participação'])}),expect.stringMatching(/origem/));
  });

  it('keeps PDF, XLSX and CSV export available for the current report',async()=>{
    const user=userEvent.setup();render(<ReportsPage/>);await user.click(screen.getByRole('button',{name:'Exportar relatório'}));
    expect(screen.getByRole('button',{name:'Exportar PDF'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'Exportar XLSX'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'Exportar CSV'})).toBeInTheDocument();
  });
});
