import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {DashboardPage} from '../pages/DashboardPage';

type StoredLayoutItem={i:string;x:number;y:number;w:number;h:number;minW?:number;minH?:number;breakpoint?:string;pinned?:boolean;added?:boolean;static?:boolean};
const state=vi.hoisted(()=>({
  width:1200,
  workspace:'workspace-editor',
  rpc:vi.fn(),
  layout:{i:'leads',x:2,y:9,w:5,h:2,minW:2,minH:2},
  responsiveLayouts:{lg:[{i:'open',x:1,y:1,w:6,h:2}],md:[{i:'open',x:3,y:4,w:4,h:2}],sm:[],xs:[]},
  preferenceLayout:null as StoredLayoutItem[]|null,
}));
const snapshot={workspace:{id:'workspace-editor',name:'Marketing Core'},membership:{role:'owner'},rolePermissions:[],summary:null,contacts:[],deals:[{id:'deal-open',name:'Negociação de teste',status:'open',created_at:'2026-10-12T12:00:00.000Z',updated_at:'2026-10-12T12:00:00.000Z',value:1500,owner_id:null}],stages:[],pipelines:[],teamGroups:[] as Array<{id:string;name:string;member_ids:string[]}>,members:[],tasks:[],tags:[],contactTags:[],notifications:[],campaigns:[],segmentLists:[],segmentMembers:[],automations:[],importHistory:[]};

vi.mock('react-grid-layout',()=>({
  ResponsiveGridLayout:({children,onDragStop,onLayoutChange,dragConfig,resizeConfig,layouts}:any)=><><button type="button" data-testid="simulate-editor-layout-change" onClick={()=>onDragStop?.([state.layout])}>simulate layout</button><button type="button" data-testid="simulate-responsive-layout-change" onClick={()=>onLayoutChange?.(state.responsiveLayouts.lg,state.responsiveLayouts)}>simulate responsive layout</button><div data-testid="responsive-grid" data-drag-enabled={dragConfig?.enabled} data-resize-enabled={resizeConfig?.enabled} data-static-items={(layouts?.lg||[]).filter((item:any)=>item.static).map((item:any)=>item.i).join(',')} data-md-layout={JSON.stringify(layouts?.md||[])}>{children}</div></>,
  useContainerWidth:()=>({width:state.width,containerRef:()=>undefined,mounted:true}),
}));
vi.mock('../lib/remoteCrm',()=>({isRemoteMode:()=>true,getRemoteWorkspaceId:()=>state.workspace,remoteRpc:(name:string,args:unknown)=>state.rpc(name,args),remoteReadRpc:(name:string,args:unknown)=>state.rpc(name,args)}));
vi.mock('../lib/useRemoteSnapshot',()=>({useRemoteSnapshot:()=>snapshot}));

const chooseCustomPeriod=()=>{fireEvent.change(screen.getByLabelText('Período da visão geral'),{target:{value:'custom'}});fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-10-01'}});fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-10-31'}})};
const addCard=async(user:ReturnType<typeof userEvent.setup>,id='leads')=>{await user.selectOptions(screen.getByRole('combobox',{name:'Adicionar um card'}),id);await user.click(screen.getByRole('button',{name:'Adicionar card'}));};

beforeEach(()=>{
  state.width=1200;
  state.workspace='workspace-editor';
  state.layout={i:'leads',x:2,y:9,w:5,h:2,minW:2,minH:2};
  state.responsiveLayouts={lg:[{i:'open',x:1,y:1,w:6,h:2}],md:[{i:'open',x:3,y:4,w:4,h:2}],sm:[],xs:[]};
  state.preferenceLayout=null;
  snapshot.teamGroups.splice(0,snapshot.teamGroups.length);
  state.rpc.mockReset().mockImplementation(async(name:string,args:unknown)=>{
    if(name==='core_dashboard_preferences_get')return{layout:state.preferenceLayout,selected_team_id:null};
    if(name==='core_dashboard_goals_list')return[];
    if(name==='core_dashboard_preferences_save'){
      const payload=args as {p_layout:StoredLayoutItem[];p_selected_team_id:string|null};
      state.preferenceLayout=payload.p_layout;
      return{layout:payload.p_layout,selected_team_id:payload.p_selected_team_id};
    }
    return{};
  });
});
afterEach(()=>snapshot.teamGroups.splice(0,snapshot.teamGroups.length));

describe('dashboard card editor',()=>{
  it('persists and restores separate layouts for each responsive breakpoint',async()=>{
    const user=userEvent.setup();
    const view=render(<DashboardPage/>);
    chooseCustomPeriod();
    await user.click(screen.getByRole('button',{name:'Editar visão geral'}));
    await user.click(screen.getByTestId('simulate-responsive-layout-change'));
    await user.click(screen.getByRole('button',{name:'Aplicar alterações'}));

    expect(state.preferenceLayout).toEqual(expect.arrayContaining([
      expect.objectContaining({i:'open',breakpoint:'lg',x:1,y:1,w:6}),
      expect.objectContaining({i:'open',breakpoint:'md',x:3,y:4,w:4}),
    ]));
    view.unmount();
    render(<DashboardPage/>);
    chooseCustomPeriod();
    await waitFor(()=>expect(screen.getByTestId('responsive-grid').getAttribute('data-md-layout')).toContain('"x":3'));
    expect(screen.getByTestId('responsive-grid').getAttribute('data-md-layout')).toContain('"y":4');
  });

  it('does not allow team preferences to be written during a cancellable layout edit',async()=>{
    const user=userEvent.setup();
    snapshot.teamGroups.splice(0,snapshot.teamGroups.length,
      {id:'team-1',name:'Equipe A',member_ids:[]},
      {id:'team-2',name:'Equipe B',member_ids:[]},
    );
    render(<DashboardPage/>);
    chooseCustomPeriod();
    await user.click(screen.getByRole('button',{name:'Editar visão geral'}));
    const teamFilter=screen.getByRole('combobox',{name:'Perfil de equipe'});
    expect(teamFilter).toBeDisabled();
    state.rpc.mockClear();
    fireEvent.change(teamFilter,{target:{value:'team-2'}});
    expect(state.rpc).not.toHaveBeenCalledWith('core_dashboard_preferences_save',expect.anything());
    await user.click(screen.getByRole('button',{name:'Cancelar edição'}));
    expect(state.rpc).not.toHaveBeenCalledWith('core_dashboard_preferences_save',expect.anything());
  });

  it('adds and pins an empty card, persists its layout, and restores the lock from workspace preferences',async()=>{
    const user=userEvent.setup();
    const view=render(<DashboardPage/>);
    chooseCustomPeriod();
    expect(screen.queryByTestId('dashboard-block-leads')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button',{name:'Editar visão geral'}));
    await addCard(user);
    expect(screen.getByTestId('dashboard-block-leads')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Fixar cards'}));
    expect(screen.getByRole('button',{name:'Fixar Leads ativos'})).toHaveAttribute('aria-pressed','false');
    expect(screen.getByRole('button',{name:'Fixar Negociações abertas'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Fixar Pipeline aberto'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Fixar Atividade comercial'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Fixar Distribuição do funil'})).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('simulate-editor-layout-change'));
    await user.click(screen.getByRole('button',{name:'Fixar Leads ativos'}));
    expect(screen.getByRole('button',{name:'Desafixar Leads ativos'})).toHaveAttribute('aria-pressed','true');
    await user.click(screen.getByRole('button',{name:'Aplicar alterações'}));

    const saved=state.preferenceLayout?.find(item=>item.i==='leads');
    expect(saved).toMatchObject({i:'leads',x:2,y:9,w:5,h:2,pinned:true,added:true,static:true});
    expect(screen.getByTestId('dashboard-block-leads')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-grid')).toHaveAttribute('data-drag-enabled','false');

    view.unmount();
    render(<DashboardPage/>);
    chooseCustomPeriod();
    expect(await screen.findByTestId('dashboard-block-leads')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Editar visão geral'}));
    await user.click(screen.getByRole('button',{name:'Fixar cards'}));
    expect(screen.getByRole('button',{name:'Desafixar Leads ativos'})).toHaveAttribute('aria-pressed','true');
    expect(screen.getByTestId('responsive-grid')).toHaveAttribute('data-static-items',expect.stringContaining('leads'));
    state.rpc.mockClear();
    await user.click(screen.getByRole('button',{name:'Desafixar Leads ativos'}));
    expect(screen.getByTestId('responsive-grid')).not.toHaveAttribute('data-static-items',expect.stringContaining('leads'));
    await user.click(screen.getByRole('button',{name:'Cancelar edição'}));
    expect(state.rpc).not.toHaveBeenCalledWith('core_dashboard_preferences_save',expect.anything());
    expect(state.preferenceLayout?.find(item=>item.i==='leads')?.pinned).toBe(true);
  });

  it('keeps added empty cards in the editor but hides them after apply unless pinned',async()=>{
    const user=userEvent.setup();
    render(<DashboardPage/>);
    chooseCustomPeriod();
    await user.click(screen.getByRole('button',{name:'Editar visão geral'}));
    await addCard(user);
    expect(screen.getByTestId('dashboard-block-leads')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Aplicar alterações'}));
    expect(state.preferenceLayout?.find(item=>item.i==='leads')).toMatchObject({added:true,pinned:false});
    expect(screen.queryByTestId('dashboard-block-leads')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Editar visão geral'}));
    expect(screen.getByTestId('dashboard-block-leads')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Cancelar edição'}));
  });

  it('discards an added card and pin changes when the user cancels',async()=>{
    const user=userEvent.setup();
    render(<DashboardPage/>);
    chooseCustomPeriod();
    await user.click(screen.getByRole('button',{name:'Editar visão geral'}));
    await addCard(user);
    expect(screen.getByTestId('dashboard-block-leads')).toBeInTheDocument();
    state.rpc.mockClear();
    await user.click(screen.getByRole('button',{name:'Cancelar edição'}));
    expect(screen.queryByTestId('dashboard-block-leads')).not.toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalledWith('core_dashboard_preferences_save',expect.anything());
  });

  it('keeps editing open and reports the save error if applying preferences fails',async()=>{
    const user=userEvent.setup();
    render(<DashboardPage/>);
    chooseCustomPeriod();
    await user.click(screen.getByRole('button',{name:'Editar visão geral'}));
    state.rpc.mockImplementation(async(name:string,args:unknown)=>{
      if(name==='core_dashboard_preferences_save')throw new Error('Falha ao salvar preferências');
      if(name==='core_dashboard_preferences_get')return{layout:null,selected_team_id:null};
      if(name==='core_dashboard_goals_list')return[];
      return{};
    });
    await user.click(screen.getByRole('button',{name:'Aplicar alterações'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao salvar preferências');
    expect(screen.getByRole('button',{name:'Cancelar edição'})).toBeInTheDocument();
    expect(screen.getByTestId('responsive-grid')).toHaveAttribute('data-drag-enabled','true');
  });

  it('loads layout editing even when the separate goals request fails',async()=>{
    state.rpc.mockImplementation(async(name:string)=>{
      if(name==='core_dashboard_preferences_get')return{layout:null,selected_team_id:null};
      if(name==='core_dashboard_goals_list')throw new Error('Falha ao carregar metas');
      return{};
    });
    render(<DashboardPage/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Editar visão geral'})).toBeEnabled());
  });

  it('does not carry fixed zero-data cards into another workspace',async()=>{
    state.preferenceLayout=[{i:'leads',x:0,y:0,w:3,h:2,pinned:true,added:true,static:true}];
    const view=render(<DashboardPage/>);
    chooseCustomPeriod();
    expect(await screen.findByTestId('dashboard-block-leads')).toBeInTheDocument();
    state.workspace='workspace-other';
    state.preferenceLayout=null;
    view.rerender(<DashboardPage/>);
    await waitFor(()=>expect(screen.queryByTestId('dashboard-block-leads')).not.toBeInTheDocument());
    expect(state.rpc).toHaveBeenCalledWith('core_dashboard_preferences_get',{p_workspace:'workspace-other'});
  });
});
