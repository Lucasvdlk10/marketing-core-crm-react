import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';

const mocked=vi.hoisted(()=>({rpc:vi.fn(),remoteInsert:vi.fn(),remoteUpdate:vi.fn(),remoteDelete:vi.fn(),snapshot:null as any}));
vi.mock('../lib/remoteCrm',()=>({
  getRemoteSnapshot:()=>mocked.snapshot,
  getRemoteWorkspaceId:()=>mocked.snapshot?.workspace.id||'',
  isRemoteMode:()=>true,
  remoteInsert:mocked.remoteInsert,
  remoteUpdate:mocked.remoteUpdate,
  remoteDelete:mocked.remoteDelete,
  remoteRpc:mocked.rpc,
  REMOTE_UPDATED_EVENT:'marketing-core-remote-updated'
}));

import {CampaignsPage} from '../pages/CampaignsPage';
import {SegmentsPage} from '../pages/SegmentsPage';
import {ReportsPage} from '../pages/ReportsPage';
import {AutomationsPage} from '../pages/AutomationsPage';
import {PipelinePage} from '../pages/PipelinePage';
import {UserMenu} from '../components/layout/UserMenu';

const baseSnapshot={
  workspace:{id:'workspace-1',name:'Workspace'},membership:{user_id:'user-1'},
  contacts:[{id:'contact-1',name:'Contato remoto',email:'remote@example.com',phone:null,company:'Remota',source:'Indicação',status:'qualified',created_at:'2026-10-01T00:00:00Z'},{id:'contact-2',name:'Contato fora do segmento',email:'other@example.com',phone:null,company:'Outra',source:'Evento',status:'qualified',created_at:'2026-10-02T00:00:00Z'}],
  pipelines:[{id:'pipeline-1',name:'Pipeline remota',is_default:true,created_at:'2026-10-01T00:00:00Z'}],stages:[{id:'stage-open',name:'Qualificação',outcome:'open',position:0,pipeline_id:'pipeline-1'},{id:'stage-won',name:'Ganho',outcome:'won',position:1,pipeline_id:'pipeline-1'}],
  deals:[{id:'deal-1',pipeline_id:'pipeline-1',contact_id:'contact-1',stage_id:'stage-won',status:'won',value:'15000',owner_id:'user-1',name:'Venda remota'},{id:'deal-2',pipeline_id:'pipeline-1',contact_id:'contact-2',stage_id:'stage-open',status:'open',value:'0',owner_id:'user-1',name:'Venda fora do segmento'}],
  tasks:[{id:'task-1',title:'Tarefa remota',status:'todo',priority:'high',assigned_to:'user-1',due_at:'2026-10-20T12:00:00Z'}],
  tags:[],contactTags:[],notifications:[],members:[{user_id:'user-1',full_name:'Pessoa Remota'}],summary:null,
  campaigns:[{id:'campaign-1',name:'Campanha remota',channel:'email',budget:'5000',spent:'1200',status:'active',start_date:'2026-10-01',end_date:null,created_at:'2026-10-01T00:00:00Z'}],
  segmentLists:[{id:'list-1',name:'Segmento remoto',description:'Somente Supabase',category:'MARKETING',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}],
  segmentMembers:[{id:'member-1',list_id:'list-1',contact_id:'contact-1',deal_id:null,reason:null,added_at:'2026-10-01T00:00:00Z'}],
  automations:[{id:'rule-1',name:'Automação remota',enabled:true,creator_id:'user-1',active_revision_id:'revision-1',updated_at:'2026-10-01T00:00:00Z'}]
};

describe('authenticated pages use only the remote snapshot',()=>{
  beforeEach(()=>{mocked.snapshot=structuredClone(baseSnapshot);mocked.rpc.mockReset();mocked.remoteInsert.mockReset();mocked.remoteUpdate.mockReset();mocked.remoteDelete.mockReset();localStorage.clear();localStorage.setItem('marketing_core_segment_lists',JSON.stringify([{id:'local',name:'Segmento local',leads:99}]));localStorage.setItem('marketing_core_automations',JSON.stringify([{id:'local',name:'Automação local',nodes:[],connections:[],createdAt:'hoje'}]));});

  it('renders campaigns from core_campaigns',()=>{render(<CampaignsPage/>);expect(screen.getByText('Campanha remota')).toBeInTheDocument();expect(screen.getByText((value)=>value.replace(/\s/g,' ')==='R$ 5.000')).toBeInTheDocument();});

  it('creates, edits, pauses and deletes campaigns through awaited remote mutations',async()=>{
    const user=userEvent.setup();render(<CampaignsPage/>);
    await user.click(screen.getByRole('button',{name:/Nova campanha$/}));
    await user.type(screen.getByLabelText('Nome da campanha'),'Lançamento');
    await user.selectOptions(screen.getByLabelText('Canal'),'google');
    await user.type(screen.getByLabelText('Orçamento'),'2500');
    await user.click(screen.getByRole('button',{name:'Criar campanha'}));
    expect(mocked.remoteInsert).toHaveBeenCalledWith('core_campaigns',{name:'Lançamento',channel:'google',budget:'2500',spent:null,status:'planned',start_date:null,end_date:null});

    await user.click(screen.getByRole('button',{name:'Editar Campanha remota'}));
    await user.clear(screen.getByLabelText('Nome da campanha'));await user.type(screen.getByLabelText('Nome da campanha'),'Campanha revisada');
    await user.click(screen.getByRole('button',{name:'Salvar campanha'}));
    expect(mocked.remoteUpdate).toHaveBeenCalledWith('core_campaigns','campaign-1',expect.objectContaining({name:'Campanha revisada'}));

    await user.click(screen.getByRole('button',{name:'Pausar Campanha remota'}));
    expect(mocked.remoteUpdate).toHaveBeenCalledWith('core_campaigns','campaign-1',{status:'paused'});
    await user.click(screen.getByRole('button',{name:'Excluir Campanha remota'}));
    await user.click(screen.getByRole('button',{name:'Confirmar exclusão'}));
    expect(mocked.remoteDelete).toHaveBeenCalledWith('core_campaigns','campaign-1');
  });

  it('keeps the campaign editor open and reports remote failures',async()=>{
    mocked.remoteInsert.mockRejectedValueOnce(new Error('RLS negou a inclusão'));
    const user=userEvent.setup();render(<CampaignsPage/>);await user.click(screen.getByRole('button',{name:/Nova campanha$/}));
    await user.type(screen.getByLabelText('Nome da campanha'),'Bloqueada');await user.click(screen.getByRole('button',{name:'Criar campanha'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('RLS negou a inclusão');expect(screen.getByRole('dialog',{name:'Nova campanha'})).toBeInTheDocument();
  });

  it('renders and filters with remote segment membership without leaking localStorage lists',async()=>{const user=userEvent.setup();const view=render(<SegmentsPage/>);expect(screen.getByText('Segmento remoto')).toBeInTheDocument();expect(screen.queryByText('Segmento local')).not.toBeInTheDocument();view.unmount();render(<PipelinePage/>);await user.click(screen.getByRole('button',{name:'Filtrar pipeline'}));const segment=screen.getByLabelText('Filtrar por lista de segmentação');expect(within(segment).getByRole('option',{name:'Segmento remoto'})).toBeInTheDocument();expect(within(segment).queryByRole('option',{name:'Segmento local'})).not.toBeInTheDocument();await user.selectOptions(segment,'list-1');await user.click(screen.getByRole('button',{name:'Aplicar filtros'}));expect(screen.getByTestId('deal-card-deal-1')).toBeInTheDocument();expect(screen.queryByTestId('deal-card-deal-2')).not.toBeInTheDocument();});

  it('calculates reports without synthetic presence and labels authenticated presence as unavailable',async()=>{const user=userEvent.setup();const view=render(<ReportsPage/>);expect(screen.getByText((value)=>value.replace(/\s/g,' ')==='R$ 15.000')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Presença da equipe'}));expect(screen.getByText(/indisponível/i)).toBeInTheDocument();expect(screen.getByText('Pessoa Remota')).toBeInTheDocument();expect(screen.queryByText('Camila Andrade')).not.toBeInTheDocument();view.unmount();render(<MemoryRouter><UserMenu userName="Pessoa Remota" onLogout={()=>{}}/></MemoryRouter>);expect(screen.getByRole('button',{name:/Status compartilhado indisponível/i})).toBeDisabled();expect(screen.getByText(/não é compartilhado com a equipe/i)).toBeInTheDocument();});

  it('lists automation rules through the authenticated remote snapshot, not localStorage',()=>{render(<AutomationsPage/>);expect(screen.getByText('Automação remota')).toBeInTheDocument();expect(screen.queryByText('Automação local')).not.toBeInTheDocument();});

  it('shows remote automation state and pauses/reactivates explicitly',async()=>{const user=userEvent.setup();render(<AutomationsPage/>);expect(screen.getByText('Ativa')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Pausar Automação remota'}));await user.click(screen.getByRole('button',{name:'Confirmar pausa'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_pause',{p_workspace:'workspace-1',p_rule_id:'rule-1'});expect(screen.getByText('Pausada')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Reativar Automação remota'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_activate',{p_workspace:'workspace-1',p_rule_id:'rule-1',p_revision_id:'revision-1'});});

  it('hydrates the real graph and activates the published revision when saving',async()=>{mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_read'?{name:'Automação remota',enabled:true,active_revision_id:'revision-1',revisions:[{id:'revision-1',graph:{schema_version:'1',nodes:[{id:'trigger',type:'trigger',subtype:'LEAD_CREATED',position:{x:10,y:10},config:{}},{id:'task',type:'action',subtype:'CREATE_TASK',position:{x:200,y:10},config:{template_id:'Fazer primeiro contato',template_title:'Fazer primeiro contato'}}],edges:[{id:'edge-1',source:'trigger',target:'task'}]}}]}:name==='core_automation_publish'?{rule_id:'rule-1',revision_id:'revision-2'}:{});const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:'Editar Automação remota'}));expect(await screen.findAllByTestId('automation-node')).toHaveLength(2);await user.click(screen.getByRole('button',{name:'Salvar alterações'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_activate',{p_workspace:'workspace-1',p_rule_id:'rule-1',p_revision_id:'revision-2'});});
});
