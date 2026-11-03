import {act,render,screen,within,fireEvent,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DashboardPage} from '../pages/DashboardPage';

const rpc=vi.fn();
const configuredTeams=[{id:'team-1',name:'Equipe Closers',member_ids:['user-1']},{id:'team-2',name:'Equipe SDR',member_ids:['user-2']}];
const configuredContacts=[{id:'lead-oct',name:'Lead Outubro',source:'Google Ads',status:'active',created_at:'2026-10-10T12:00:00Z'},{id:'lead-sep',name:'Lead Setembro',source:'Indicação',status:'active',created_at:'2026-09-10T12:00:00Z'}];
const configuredDeals=[{id:'deal-open',name:'Aberta',value:1000,status:'open',owner_id:'user-1',stage_id:'stage-1',pipeline_id:'pipe-1',created_at:'2026-10-05T12:00:00Z',updated_at:'2026-10-20T12:00:00Z'},{id:'deal-won',name:'Ganha',value:5000,status:'won',owner_id:'user-1',stage_id:'stage-2',pipeline_id:'pipe-1',created_at:'2026-10-01T12:00:00Z',updated_at:'2026-10-15T12:00:00Z'},{id:'deal-other',name:'Outra equipe',value:3000,status:'won',owner_id:'user-2',stage_id:'stage-2',pipeline_id:'pipe-1',created_at:'2026-10-02T12:00:00Z',updated_at:'2026-10-16T12:00:00Z'}];
const snapshot={
 workspace:{id:'workspace-1',name:'Marketing Core'},membership:{role:'owner'},rolePermissions:[],summary:null,
 contacts:configuredContacts.map(contact=>({...contact})),
 deals:configuredDeals.map(deal=>({...deal})),
 stages:[{id:'stage-1',name:'Qualificação',position:1},{id:'stage-2',name:'Fechado',position:2}],pipelines:[{id:'pipe-1',name:'Comercial'}],
 teamGroups:[...configuredTeams],
 members:[{user_id:'user-1',full_name:'Maykelly'},{user_id:'user-2',full_name:'Lucas'}],
 tasks:[],tags:[],contactTags:[],notifications:[],campaigns:[],segmentLists:[],segmentMembers:[],automations:[],importHistory:[],
};
vi.mock('../lib/remoteCrm',()=>({isRemoteMode:()=>true,getRemoteWorkspaceId:()=> 'workspace-1',getRemoteSnapshot:()=>snapshot,remoteRpc:(name:string,args:unknown)=>rpc(name,args),remoteReadRpc:(name:string,args:unknown)=>rpc(name,args)}));
vi.mock('../lib/useRemoteSnapshot',()=>({useRemoteSnapshot:()=>snapshot}));

const localISO=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const periodRange=(days:number)=>{const today=new Date();return{start:localISO(new Date(today.getFullYear(),today.getMonth(),today.getDate()-days+1)),end:localISO(today)}};
const chooseCustomPeriod=()=>fireEvent.change(screen.getByLabelText('Período da visão geral'),{target:{value:'custom'}});
const monthPeriod=(offset=0)=>{const now=new Date();const start=new Date(now.getFullYear(),now.getMonth()+offset,1);const end=new Date(now.getFullYear(),now.getMonth()+offset+1,0);return{start:localISO(start),end:localISO(end)}};
const goalFor=(id:string,name:string,period:{start:string;end:string})=>({id,name,metric:'revenue' as const,target_value:10000,team_id:null,notify_role:null,starts_on:period.start,ends_on:period.end});

beforeEach(()=>{snapshot.contacts.splice(0,snapshot.contacts.length,...configuredContacts.map(contact=>({...contact})));snapshot.deals.splice(0,snapshot.deals.length,...configuredDeals.map(deal=>({...deal})));snapshot.teamGroups.splice(0,snapshot.teamGroups.length,...configuredTeams);rpc.mockReset();rpc.mockImplementation(async(name:string)=>name==='core_dashboard_preferences_get'?{layout:null,selected_team_id:null}:name==='core_dashboard_goals_list'?[{id:'goal-1',name:'Meta mensal',metric:'revenue',target_value:10000,team_id:'team-1',starts_on:'2026-10-01',ends_on:'2026-10-31'}]:name==='core_dashboard_goal_upsert'?{id:'goal-new'}:{});});

describe('DashboardPage',()=>{
 it('defaults to the last 30 days and offers 15-day, weekly and custom periods',()=>{
  const initialRange=periodRange(30);
  render(<DashboardPage/>);
  const period=screen.getByRole('combobox',{name:'Período da visão geral'});
  expect(Array.from((period as HTMLSelectElement).options).map(option=>option.textContent)).toEqual(['Últimos 30 dias','Últimos 15 dias','Última semana','Período personalizado']);
  expect(period).toHaveValue('30');
  expect(screen.queryByLabelText('Data inicial')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Data final')).not.toBeInTheDocument();
  fireEvent.change(period,{target:{value:'custom'}});
  expect(screen.getByLabelText('Data inicial')).toHaveValue(initialRange.start);
  expect(screen.getByLabelText('Data final')).toHaveValue(initialRange.end);
  fireEvent.change(period,{target:{value:'15'}});
  expect(period).toHaveValue('15');
  expect(screen.queryByLabelText('Data inicial')).not.toBeInTheDocument();
  fireEvent.change(period,{target:{value:'custom'}});
  expect(screen.getByLabelText('Data inicial')).toHaveValue(initialRange.start);
  expect(screen.getByLabelText('Data final')).toHaveValue(initialRange.end);
  fireEvent.change(period,{target:{value:'7'}});
  expect(period).toHaveValue('7');
  fireEvent.change(period,{target:{value:'custom'}});
  expect(screen.getByLabelText('Data inicial')).toHaveValue(initialRange.start);
  fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
  fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
  fireEvent.change(period,{target:{value:'15'}});
  fireEvent.change(period,{target:{value:'custom'}});
  expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-10-01');
  expect(screen.getByLabelText('Data final')).toHaveValue('2026-10-31');
  expect(screen.getByTestId('metric-leads')).toHaveTextContent('1');
  expect(screen.getByTestId('metric-revenue')).toHaveTextContent('R$ 8.000');
 });

 it('hides the team selector with one team and ignores a stale saved team filter',async()=>{
  snapshot.teamGroups.splice(0,snapshot.teamGroups.length,configuredTeams[0]);
  let resolvePreference!:(value:{layout:null;selected_team_id:string})=>void;
  rpc.mockImplementation((name:string)=>name==='core_dashboard_preferences_get'?new Promise(resolve=>{resolvePreference=resolve}):name==='core_dashboard_goals_list'?Promise.resolve([{id:'orphan-goal',name:'Meta de outra equipe',metric:'revenue',target_value:10000,team_id:'team-2',notify_role:null,starts_on:'2026-10-01',ends_on:'2026-10-31'}]):Promise.resolve({}));
  render(<DashboardPage/>);
  chooseCustomPeriod();
  fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
  fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
  expect(screen.queryByLabelText('Perfil de equipe')).not.toBeInTheDocument();
  await act(async()=>{resolvePreference({layout:null,selected_team_id:'deleted-team'});});
  expect(screen.getByTestId('metric-revenue')).toHaveTextContent('R$ 8.000');
  expect(screen.getByTestId('dashboard-block-goals')).toBeInTheDocument();
  expect(screen.getByText('Meta de outra equipe')).toBeInTheDocument();
 });

 it('hides the open-pipeline value card when its value is zero but keeps populated cards',()=>{
  snapshot.deals.find(deal=>deal.status==='open')!.value=0;
  render(<DashboardPage/>);
  chooseCustomPeriod();
  fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
  fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
  expect(screen.getByTestId('dashboard-block-open')).toBeInTheDocument();
  expect(screen.queryByTestId('dashboard-block-pipeline')).not.toBeInTheDocument();
  expect(screen.getByTestId('dashboard-block-revenue')).toBeInTheDocument();
  expect(screen.getByText('Distribuição do funil')).toBeInTheDocument();
 });

 it('shows the requested funnel distribution and commercial indicators in the overview',()=>{
  render(<DashboardPage/>);
  chooseCustomPeriod();
  fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
  fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
  expect(screen.getByTestId('dashboard-block-funnel')).toBeInTheDocument();
  expect(screen.getByTestId('dashboard-block-commercial')).toBeInTheDocument();
  expect(screen.getByText('Distribuição do funil')).toBeInTheDocument();
    expect(screen.getByText('Indicadores comerciais')).toBeInTheDocument();
  expect(screen.getByText('Taxa de conversão')).toBeInTheDocument();
  expect(screen.getByText('Ticket médio')).toBeInTheDocument();
  expect(screen.getByText('Perdas registradas')).toBeInTheDocument();
 });

 it('shows an empty-state instead of empty dashboard cards when the selected scope has no data',async()=>{
  snapshot.contacts.splice(0,snapshot.contacts.length);
  snapshot.deals.splice(0,snapshot.deals.length);
  rpc.mockImplementation(async(name:string)=>name==='core_dashboard_preferences_get'?{layout:null,selected_team_id:null}:name==='core_dashboard_goals_list'?[]:{});
  render(<DashboardPage/>);
  await act(async()=>{await Promise.resolve();});
  expect(screen.getByTestId('dashboard-no-data')).toBeInTheDocument();
  for(const id of ['leads','open','pipeline','revenue','velocity','goals','activity','funnel','commercial'])expect(screen.queryByTestId(`dashboard-block-${id}`)).not.toBeInTheDocument();
 });

 it('applies one global date filter to every indicator and chart',async()=>{
  const user=userEvent.setup();render(<DashboardPage/>);
  chooseCustomPeriod();
  fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
  fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
  expect(screen.getByTestId('metric-leads')).toHaveTextContent('1');
  expect(screen.getByTestId('metric-revenue')).toHaveTextContent('R$ 8.000');
  expect(screen.getByText('Velocidade do pipeline')).toBeInTheDocument();
 });

 it('opens a detailed side panel when an indicator is clicked',async()=>{
  const user=userEvent.setup();render(<DashboardPage/>);
  chooseCustomPeriod();
  fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
  fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
  await user.click(screen.getByRole('button',{name:/Detalhes de Leads ativos/i}));
  const drawer=screen.getByRole('dialog',{name:'Detalhes de Leads ativos'});
  expect(within(drawer).getByText('Lead Outubro')).toBeInTheDocument();
  await user.click(within(drawer).getByRole('button',{name:'Fechar detalhes'}));
  expect(screen.queryByRole('dialog',{name:'Detalhes de Leads ativos'})).not.toBeInTheDocument();
 });

 it('segments the dashboard by custom team and shows velocity and goal progress',async()=>{
  const user=userEvent.setup();render(<DashboardPage/>);
  chooseCustomPeriod();
  fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
  fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
  await user.selectOptions(screen.getByLabelText('Perfil de equipe'),'team-1');
  expect(screen.getByTestId('metric-revenue')).toHaveTextContent('R$ 5.000');
  expect(screen.getByRole('option',{name:'Equipe Closers'})).toBeInTheDocument();
  expect(screen.getByLabelText('Progresso Meta mensal')).toHaveAttribute('aria-valuenow','50');
  expect(screen.getByText(/14 dias/)).toBeInTheDocument();
 });

 it('opens goals intelligence with prediction and saves a tenant goal for the current month',async()=>{
  const user=userEvent.setup();const month=monthPeriod();render(<DashboardPage/>);
  await user.click(screen.getByRole('button',{name:'Metas e inteligência'}));
  const dialog=screen.getByRole('dialog',{name:'Metas e inteligência de vendas'});
  expect(within(dialog).getByText(/Projeção/i)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button',{name:'Nova meta'}));
  expect(within(dialog).getByText(`Mês de referência · ${month.start.slice(0,7)}`)).toBeInTheDocument();
  expect(within(dialog).queryByLabelText('Início da meta')).not.toBeInTheDocument();
  expect(within(dialog).queryByLabelText('Fim da meta')).not.toBeInTheDocument();
  await user.type(within(dialog).getByLabelText('Nome da meta'),'Receita novembro');
  await user.clear(within(dialog).getByLabelText('Valor da meta'));await user.type(within(dialog).getByLabelText('Valor da meta'),'20000');
  await user.click(within(dialog).getByRole('button',{name:'Salvar meta'}));
  expect(rpc).toHaveBeenCalledWith('core_dashboard_goal_upsert',expect.objectContaining({p_workspace:'workspace-1',p_id:null,p_name:'Receita novembro',p_target_value:20000,p_starts_on:month.start,p_ends_on:month.end}));
 });

 it('keeps resizing disabled until the user opens edit mode',async()=>{
  const user=userEvent.setup();
  render(<DashboardPage/>);
  chooseCustomPeriod();
  fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
  fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
  const block=await screen.findByTestId('dashboard-block-leads');
  expect(block).toHaveClass('react-grid-item');
  expect(screen.getByTestId('dashboard-grid-shell')).not.toHaveClass('is-editing');
  await user.click(screen.getByRole('button',{name:'Editar visão geral'}));
  expect(screen.getByRole('button',{name:'Aplicar alterações'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Cancelar edição'})).toBeInTheDocument();
  expect(screen.getByTestId('dashboard-grid-shell')).toHaveClass('is-editing');
  await user.click(screen.getByRole('button',{name:'Cancelar edição'}));
  expect(rpc).not.toHaveBeenCalledWith('core_dashboard_preferences_save',expect.anything());
 });

 it('allows editing only goals in the current month',async()=>{
  const user=userEvent.setup();
  const current=goalFor('goal-current','Meta atual',monthPeriod());
  const past=goalFor('goal-past','Meta passada',monthPeriod(-1));
  const future=goalFor('goal-future','Meta futura',monthPeriod(1));
  rpc.mockImplementation(async(name:string)=>name==='core_dashboard_preferences_get'?{layout:null,selected_team_id:null}:name==='core_dashboard_goals_list'?[current,past,future]:name==='core_dashboard_goal_upsert'?{id:'goal-new'}:{});
  render(<DashboardPage/>);
  await user.click(screen.getByRole('button',{name:'Metas e inteligência'}));
  const dialog=screen.getByRole('dialog',{name:'Metas e inteligência de vendas'});
  expect(within(dialog).getByRole('button',{name:'Editar meta Meta atual'})).toBeInTheDocument();
  expect(within(dialog).queryByRole('button',{name:'Editar meta Meta passada'})).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('button',{name:'Editar meta Meta futura'})).not.toBeInTheDocument();
 });

 it('prefills and updates the existing current-month goal',async()=>{
  const user=userEvent.setup();
  const current=goalFor('goal-current','Meta atual',monthPeriod());
  rpc.mockImplementation(async(name:string)=>name==='core_dashboard_preferences_get'?{layout:null,selected_team_id:null}:name==='core_dashboard_goals_list'?[current]:name==='core_dashboard_goal_upsert'?{id:current.id}:{});
  render(<DashboardPage/>);
  await user.click(screen.getByRole('button',{name:'Metas e inteligência'}));
  const dialog=screen.getByRole('dialog',{name:'Metas e inteligência de vendas'});
  await user.click(within(dialog).getByRole('button',{name:'Editar meta Meta atual'}));
  expect(within(dialog).getByLabelText('Nome da meta')).toHaveValue('Meta atual');
  expect(within(dialog).getByLabelText('Valor da meta')).toHaveValue(10000);
  await user.clear(within(dialog).getByLabelText('Nome da meta'));
  await user.type(within(dialog).getByLabelText('Nome da meta'),'Meta atualizada');
  await user.clear(within(dialog).getByLabelText('Valor da meta'));
  await user.type(within(dialog).getByLabelText('Valor da meta'),'15000');
  await user.click(within(dialog).getByRole('button',{name:'Salvar alterações'}));
  expect(rpc).toHaveBeenCalledWith('core_dashboard_goal_upsert',expect.objectContaining({p_workspace:'workspace-1',p_id:'goal-current',p_name:'Meta atualizada',p_target_value:15000,p_starts_on:current.starts_on,p_ends_on:current.ends_on}));
 });

 it('requires confirmation before deleting a historical goal',async()=>{
  const user=userEvent.setup();
  let visibleGoals=[goalFor('goal-past','Meta passada',monthPeriod(-1))];
  rpc.mockImplementation(async(name:string)=>{if(name==='core_dashboard_preferences_get')return{layout:null,selected_team_id:null};if(name==='core_dashboard_goals_list')return visibleGoals;if(name==='core_dashboard_goal_delete'){visibleGoals=[];return{deleted:true}}return{}});
  render(<DashboardPage/>);
  await user.click(screen.getByRole('button',{name:'Metas e inteligência'}));
  const dialog=screen.getByRole('dialog',{name:'Metas e inteligência de vendas'});
  await user.click(within(dialog).getByRole('button',{name:'Excluir meta Meta passada'}));
  expect(rpc).not.toHaveBeenCalledWith('core_dashboard_goal_delete',expect.anything());
  const confirmation=screen.getByRole('alertdialog',{name:'Confirmar exclusão da meta'});
  await user.click(within(confirmation).getByRole('button',{name:'Cancelar exclusão'}));
  expect(rpc).not.toHaveBeenCalledWith('core_dashboard_goal_delete',expect.anything());
  await user.click(within(dialog).getByRole('button',{name:'Excluir meta Meta passada'}));
  await user.click(within(screen.getByRole('alertdialog',{name:'Confirmar exclusão da meta'})).getByRole('button',{name:'Confirmar exclusão'}));
  await waitFor(()=>expect(within(dialog).getByText('Nenhuma meta configurada.')).toBeInTheDocument());
  expect(rpc).toHaveBeenCalledWith('core_dashboard_goal_delete',{p_workspace:'workspace-1',p_id:'goal-past'});
 });

 it('shows goals as visual guidance and does not trigger operational notifications',async()=>{
  const user=userEvent.setup();
  rpc.mockImplementation(async(name:string)=>name==='core_dashboard_preferences_get'?{layout:null,selected_team_id:null}:name==='core_dashboard_goals_list'?[]:{});
  render(<DashboardPage/>);
  await user.click(screen.getByRole('button',{name:'Metas e inteligência'}));
  const dialog=screen.getByRole('dialog',{name:'Metas e inteligência de vendas'});
  expect(within(dialog).getByText('Metas mensais são referências visuais de orientação, não obrigações nem critérios de avaliação.')).toBeInTheDocument();
  expect(rpc).not.toHaveBeenCalledWith('core_dashboard_refresh_goal_notifications',{p_workspace:'workspace-1'});
 });
});
