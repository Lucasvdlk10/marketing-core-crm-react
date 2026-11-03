import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DashboardPage} from '../pages/DashboardPage';

const state=vi.hoisted(()=>({rpc:vi.fn(),width:390,layout:{i:'open',x:0,y:0,w:1,h:1}}));
const snapshot={workspace:{id:'workspace-mobile',name:'Marketing Core'},membership:{role:'owner'},rolePermissions:[],summary:null,contacts:[],deals:[{id:'deal-open-1',name:'Lead aberto exemplo',status:'open',created_at:'2026-10-12T12:00:00.000Z',updated_at:'2026-10-12T12:00:00.000Z',value:1500,owner_id:null},{id:'deal-won-1',name:'Lead ganho exemplo',status:'won',created_at:'2026-10-10T12:00:00.000Z',updated_at:'2026-10-15T12:00:00.000Z',value:2500,owner_id:null},{id:'deal-lost-1',name:'Lead perdido exemplo',status:'lost',created_at:'2026-10-11T12:00:00.000Z',updated_at:'2026-10-16T12:00:00.000Z',value:500,owner_id:null}],stages:[],pipelines:[],teamGroups:[],members:[],tasks:[],tags:[],contactTags:[],notifications:[],campaigns:[],segmentLists:[],segmentMembers:[],automations:[],importHistory:[]};

vi.mock('react-grid-layout',()=>({
  ResponsiveGridLayout:({children,onDragStop,dragConfig,resizeConfig}:any)=><><button type="button" data-testid="simulate-mobile-layout-change" onClick={()=>onDragStop?.([state.layout])}>simulate</button><div className="react-grid-layout" data-testid="responsive-grid" data-drag-enabled={dragConfig?.enabled} data-resize-enabled={resizeConfig?.enabled}>{children}</div></>,
  useContainerWidth:()=>({width:state.width,containerRef:()=>undefined,mounted:true}),
}));
vi.mock('../lib/remoteCrm',()=>({isRemoteMode:()=>true,getRemoteWorkspaceId:()=> 'workspace-mobile',remoteRpc:(name:string,args:unknown)=>state.rpc(name,args),remoteReadRpc:(name:string,args:unknown)=>state.rpc(name,args)}));
vi.mock('../lib/useRemoteSnapshot',()=>({useRemoteSnapshot:()=>snapshot}));

beforeEach(()=>{state.width=390;state.rpc.mockReset().mockImplementation(async(name:string)=>name==='core_dashboard_preferences_get'?{layout:null,selected_team_id:null}:name==='core_dashboard_goals_list'?[]:{})});

describe('dashboard mobile layout',()=>{
  it('renders only populated indicators in a mobile-only layout and never overwrites the desktop preference',async()=>{
    render(<DashboardPage/>);
    const shell=await screen.findByTestId('dashboard-grid-shell');
    expect(shell).toHaveClass('mobile-dashboard');
    fireEvent.change(screen.getByLabelText('Período da visão geral'),{target:{value:'custom'}});
    fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
    fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
    expect(screen.queryByTestId('dashboard-block-leads')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-block-open')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-block-pipeline')).toBeInTheDocument();
    expect(screen.getByText('Velocidade do pipeline')).toBeInTheDocument();
    expect(screen.getByText('Distribuição do funil')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-block-commercial')).toBeInTheDocument();
    expect(screen.queryByLabelText('Perfil de equipe')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('simulate-mobile-layout-change'));
    await waitFor(()=>expect(state.rpc).not.toHaveBeenCalledWith('core_dashboard_preferences_save',expect.anything()));
  });

  it('shows period-matched funnel counts without misleading row drilldowns',async()=>{
    render(<DashboardPage/>);
    fireEvent.change(screen.getByLabelText('Período da visão geral'),{target:{value:'custom'}});
    fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
    fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
    const funnel=await screen.findByTestId('dashboard-block-funnel');
    expect(within(funnel).getByText('Distribuição do funil')).toBeInTheDocument();
    expect(within(funnel).getByText('Negociações')).toBeInTheDocument();
    expect(within(funnel).getByText('3')).toBeInTheDocument();
    expect(within(funnel).getByText('Ganhos')).toBeInTheDocument();
    expect(within(funnel).getByText('1')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Ver 1 negociações abertas/})).not.toBeInTheDocument();
  });

  it('keeps the desktop grid locked until edit mode and saves only after applying',async()=>{
    state.width=1200;
    render(<DashboardPage/>);
    fireEvent.change(screen.getByLabelText('Período da visão geral'),{target:{value:'custom'}});
    fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});
    fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}});
    const shell=await screen.findByTestId('dashboard-grid-shell');
    expect(shell).not.toHaveClass('mobile-dashboard');
    expect(screen.getByTestId('responsive-grid')).toHaveAttribute('data-drag-enabled','false');
    expect(screen.getByTestId('responsive-grid')).toHaveAttribute('data-resize-enabled','false');
    fireEvent.click(screen.getByRole('button',{name:'Editar visão geral'}));
    expect(screen.getByTestId('responsive-grid')).toHaveAttribute('data-drag-enabled','true');
    expect(screen.getByTestId('responsive-grid')).toHaveAttribute('data-resize-enabled','true');
    fireEvent.click(screen.getByTestId('simulate-mobile-layout-change'));
    expect(state.rpc).not.toHaveBeenCalledWith('core_dashboard_preferences_save',expect.anything());
    fireEvent.click(screen.getByRole('button',{name:'Aplicar alterações'}));
    await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith('core_dashboard_preferences_save',expect.objectContaining({p_layout:expect.arrayContaining([expect.objectContaining(state.layout)])})));
  });
});
