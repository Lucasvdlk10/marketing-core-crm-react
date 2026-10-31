import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DashboardPage} from '../pages/DashboardPage';

const state=vi.hoisted(()=>({rpc:vi.fn(),width:390,layout:{i:'leads',x:0,y:0,w:1,h:1}}));
const snapshot={workspace:{id:'workspace-mobile',name:'Marketing Core'},membership:{role:'owner'},rolePermissions:[],summary:null,contacts:[],deals:[{id:'deal-open-1',name:'Lead aberto exemplo',status:'open',created_at:'2026-10-12T12:00:00.000Z',updated_at:'2026-10-12T12:00:00.000Z',value:1500,owner_id:null},{id:'deal-won-1',name:'Lead ganho exemplo',status:'won',created_at:'2026-10-10T12:00:00.000Z',updated_at:'2026-10-15T12:00:00.000Z',value:2500,owner_id:null},{id:'deal-lost-1',name:'Lead perdido exemplo',status:'lost',created_at:'2026-10-11T12:00:00.000Z',updated_at:'2026-10-16T12:00:00.000Z',value:500,owner_id:null}],stages:[],pipelines:[],teamGroups:[],members:[],tasks:[],tags:[],contactTags:[],notifications:[],campaigns:[],segmentLists:[],segmentMembers:[],automations:[],importHistory:[]};

vi.mock('react-grid-layout',()=>({
  ResponsiveGridLayout:({children,onDragStop,dragConfig}:any)=><><button type="button" data-testid="simulate-mobile-layout-change" onClick={()=>onDragStop?.([state.layout])}>simulate</button><div className="react-grid-layout" data-testid="responsive-grid" data-drag-enabled={dragConfig?.enabled}>{children}</div></>,
  useContainerWidth:()=>({width:state.width,containerRef:()=>undefined,mounted:true}),
}));
vi.mock('../lib/remoteCrm',()=>({isRemoteMode:()=>true,getRemoteWorkspaceId:()=> 'workspace-mobile',remoteRpc:(name:string,args:unknown)=>state.rpc(name,args)}));
vi.mock('../lib/useRemoteSnapshot',()=>({useRemoteSnapshot:()=>snapshot}));

beforeEach(()=>{state.width=390;state.rpc.mockReset().mockImplementation(async(name:string)=>name==='core_dashboard_preferences_get'?{layout:null,selected_team_id:null}:name==='core_dashboard_goals_list'?[]:{})});

describe('dashboard mobile layout',()=>{
  it('renders every indicator in a mobile-only layout and never overwrites the desktop preference',async()=>{
    render(<DashboardPage/>);
    const shell=await screen.findByTestId('dashboard-grid-shell');
    expect(shell).toHaveClass('mobile-dashboard');
    expect(screen.getByTestId('dashboard-block-leads')).toBeInTheDocument();
    expect(screen.getByText('Velocidade do pipeline')).toBeInTheDocument();
    expect(screen.getByText('Funil do período')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('simulate-mobile-layout-change'));
    await waitFor(()=>expect(state.rpc).not.toHaveBeenCalledWith('core_dashboard_preferences_save',expect.anything()));
  });

  it('opens the period funnel rows with only matching open and won deals',async()=>{
    render(<DashboardPage/>);

    fireEvent.click(await screen.findByRole('button',{name:'Ver 1 negociações abertas'}));
    expect(screen.getByRole('dialog',{name:'Detalhes de Negociações abertas'})).toBeInTheDocument();
    expect(screen.getByText('Lead aberto exemplo')).toBeInTheDocument();
    expect(screen.queryByText('Lead ganho exemplo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Fechar detalhes'}));

    fireEvent.click(screen.getByRole('button',{name:'Ver 1 negociações ganhas'}));
    expect(screen.getByRole('dialog',{name:'Detalhes de Negociações ganhas'})).toBeInTheDocument();
    expect(screen.getByText('Lead ganho exemplo')).toBeInTheDocument();
    expect(screen.queryByText('Lead aberto exemplo')).not.toBeInTheDocument();
    expect(screen.queryByText('Lead perdido exemplo')).not.toBeInTheDocument();
  });

  it('keeps the desktop grid interactive and saves its customized layout',async()=>{
    state.width=1200;
    render(<DashboardPage/>);
    const shell=await screen.findByTestId('dashboard-grid-shell');
    expect(shell).not.toHaveClass('mobile-dashboard');
    expect(screen.getByTestId('responsive-grid')).toHaveAttribute('data-drag-enabled','true');
    fireEvent.click(screen.getByTestId('simulate-mobile-layout-change'));
    await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith('core_dashboard_preferences_save',expect.objectContaining({p_layout:[state.layout]})));
  });
});
