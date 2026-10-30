import {render,screen,within,fireEvent,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DashboardPage} from '../pages/DashboardPage';

const rpc=vi.fn();
const snapshot={
 workspace:{id:'workspace-1',name:'Marketing Core'},membership:{role:'owner'},rolePermissions:[],summary:null,
 contacts:[
  {id:'lead-oct',name:'Lead Outubro',source:'Google Ads',status:'active',created_at:'2026-10-10T12:00:00Z'},
  {id:'lead-sep',name:'Lead Setembro',source:'Indicação',status:'active',created_at:'2026-09-10T12:00:00Z'},
 ],
 deals:[
  {id:'deal-open',name:'Aberta',value:1000,status:'open',owner_id:'user-1',stage_id:'stage-1',pipeline_id:'pipe-1',created_at:'2026-10-05T12:00:00Z',updated_at:'2026-10-20T12:00:00Z'},
  {id:'deal-won',name:'Ganha',value:5000,status:'won',owner_id:'user-1',stage_id:'stage-2',pipeline_id:'pipe-1',created_at:'2026-10-01T12:00:00Z',updated_at:'2026-10-15T12:00:00Z'},
  {id:'deal-other',name:'Outra equipe',value:3000,status:'won',owner_id:'user-2',stage_id:'stage-2',pipeline_id:'pipe-1',created_at:'2026-10-02T12:00:00Z',updated_at:'2026-10-16T12:00:00Z'},
 ],
 stages:[{id:'stage-1',name:'Qualificação',position:1},{id:'stage-2',name:'Fechado',position:2}],pipelines:[{id:'pipe-1',name:'Comercial'}],
 teamGroups:[{id:'team-1',name:'Equipe Closers',member_ids:['user-1']},{id:'team-2',name:'Equipe SDR',member_ids:['user-2']}],
 members:[{user_id:'user-1',full_name:'Maykelly'},{user_id:'user-2',full_name:'Lucas'}],
 tasks:[],tags:[],contactTags:[],notifications:[],campaigns:[],segmentLists:[],segmentMembers:[],automations:[],importHistory:[],
};
vi.mock('../lib/remoteCrm',()=>({isRemoteMode:()=>true,getRemoteWorkspaceId:()=> 'workspace-1',getRemoteSnapshot:()=>snapshot,remoteRpc:(name:string,args:unknown)=>rpc(name,args)}));
vi.mock('../lib/useRemoteSnapshot',()=>({useRemoteSnapshot:()=>snapshot}));

beforeEach(()=>{rpc.mockReset();rpc.mockImplementation(async(name:string)=>name==='core_dashboard_preferences_get'?{layout:null,selected_team_id:null}:name==='core_dashboard_goals_list'?[{id:'goal-1',name:'Meta mensal',metric:'revenue',target_value:10000,team_id:'team-1',starts_on:'2026-10-01',ends_on:'2026-10-31'}]:name==='core_dashboard_goal_upsert'?{id:'goal-new'}:{});});

describe('DashboardPage',()=>{
 it('applies one global date filter to every indicator and chart',async()=>{
  const user=userEvent.setup();render(<DashboardPage/>);
  fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
  fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
  expect(screen.getByTestId('metric-leads')).toHaveTextContent('1');
  expect(screen.getByTestId('metric-revenue')).toHaveTextContent('R$ 8.000');
  expect(screen.getByText('Velocidade do pipeline')).toBeInTheDocument();
 });

 it('opens a detailed side panel when an indicator is clicked',async()=>{
  const user=userEvent.setup();render(<DashboardPage/>);
  await user.click(screen.getByRole('button',{name:/Detalhes de Leads ativos/i}));
  const drawer=screen.getByRole('dialog',{name:'Detalhes de Leads ativos'});
  expect(within(drawer).getByText('Lead Outubro')).toBeInTheDocument();
  await user.click(within(drawer).getByRole('button',{name:'Fechar detalhes'}));
  expect(screen.queryByRole('dialog',{name:'Detalhes de Leads ativos'})).not.toBeInTheDocument();
 });

 it('segments the dashboard by custom team and shows velocity and goal progress',async()=>{
  const user=userEvent.setup();render(<DashboardPage/>);
  await user.selectOptions(screen.getByLabelText('Perfil de equipe'),'team-1');
  expect(screen.getByTestId('metric-revenue')).toHaveTextContent('R$ 5.000');
  expect(screen.getByRole('option',{name:'Equipe Closers'})).toBeInTheDocument();
  expect(screen.getByLabelText('Progresso Meta mensal')).toHaveAttribute('aria-valuenow','50');
  expect(screen.getByText(/14 dias/)).toBeInTheDocument();
 });

 it('opens goals intelligence with prediction and saves a tenant goal',async()=>{
  const user=userEvent.setup();render(<DashboardPage/>);
  await user.click(screen.getByRole('button',{name:'Metas e inteligência'}));
  const dialog=screen.getByRole('dialog',{name:'Metas e inteligência de vendas'});
  expect(within(dialog).getByText(/Projeção/i)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button',{name:'Nova meta'}));
  await user.type(within(dialog).getByLabelText('Nome da meta'),'Receita novembro');
  await user.clear(within(dialog).getByLabelText('Valor da meta'));await user.type(within(dialog).getByLabelText('Valor da meta'),'20000');
  await user.click(within(dialog).getByRole('button',{name:'Salvar meta'}));
  expect(rpc).toHaveBeenCalledWith('core_dashboard_goal_upsert',expect.objectContaining({p_workspace:'workspace-1',p_name:'Receita novembro',p_target_value:20000}));
 });

 it('renders every dashboard block as draggable and resizable and persists layout changes',async()=>{
  render(<DashboardPage/>);
  const block=await screen.findByTestId('dashboard-block-leads');
  expect(block).toHaveClass('react-grid-item');
  expect(block.querySelector('.react-resizable-handle')).toBeInTheDocument();
  expect(block.querySelector('.dashboard-drag-handle')).toBeInTheDocument();
  expect(rpc).toHaveBeenCalledWith('core_dashboard_preferences_get',{p_workspace:'workspace-1'});
 });
});
