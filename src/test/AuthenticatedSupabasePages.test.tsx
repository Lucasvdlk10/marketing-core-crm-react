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
  tags:[{id:'tag-1',name:'VIP remoto',color:'#123456'}],contactTags:[],notifications:[],members:[{user_id:'user-1',full_name:'Pessoa Remota'}],summary:null,
  campaigns:[{id:'campaign-1',name:'Campanha remota',channel:'email',budget:'5000',spent:'1200',status:'active',start_date:'2026-10-01',end_date:null,created_at:'2026-10-01T00:00:00Z'}],
  segmentLists:[{id:'list-1',name:'Segmento remoto',description:'Somente Supabase',category:'MARKETING',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}],
  segmentMembers:[{id:'member-1',list_id:'list-1',contact_id:'contact-1',deal_id:null,reason:null,added_at:'2026-10-01T00:00:00Z'}],
  automations:[{id:'rule-1',name:'Automação remota',enabled:true,creator_id:'user-1',active_revision_id:'revision-1',updated_at:'2026-10-01T00:00:00Z'}]
};

describe('authenticated pages use only the remote snapshot',()=>{
  beforeEach(()=>{mocked.snapshot=structuredClone(baseSnapshot);mocked.rpc.mockReset().mockResolvedValue([]);mocked.remoteInsert.mockReset().mockResolvedValue({});mocked.remoteUpdate.mockReset().mockResolvedValue({});mocked.remoteDelete.mockReset().mockResolvedValue({});localStorage.clear();localStorage.setItem('marketing_core_segment_lists',JSON.stringify([{id:'local',name:'Segmento local',leads:99}]));localStorage.setItem('marketing_core_automations',JSON.stringify([{id:'local',name:'Automação local',nodes:[],connections:[],createdAt:'hoje'}]));});

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

  it('calculates reports without synthetic presence and persists authenticated status in Supabase',async()=>{mocked.rpc.mockImplementation(async(name:string)=>name==='core_presence_get'?{status:'online'}:name==='core_presence_set'?{status:'meeting'}:{});const user=userEvent.setup();const view=render(<ReportsPage/>);expect(screen.getByText((value)=>value.replace(/\s/g,' ')==='R$ 15.000')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Presença da equipe'}));expect(screen.getByText(/indisponível/i)).toBeInTheDocument();expect(screen.getByText('Pessoa Remota')).toBeInTheDocument();expect(screen.queryByText('Camila Andrade')).not.toBeInTheDocument();view.unmount();render(<MemoryRouter><UserMenu userName="Pessoa Remota" onLogout={()=>{}}/></MemoryRouter>);const status=await screen.findByRole('button',{name:/Alterar status. Atual: Online/i});expect(status).toBeEnabled();await user.click(status);await user.click(screen.getByRole('menuitemradio',{name:/Em reunião/i}));expect(mocked.rpc).toHaveBeenCalledWith('core_presence_set',{p_workspace:'workspace-1',p_status:'meeting'});expect(screen.getByRole('button',{name:/Alterar status. Atual: Em reunião/i})).toBeInTheDocument();});

  it('lists automation rules through the authenticated remote snapshot, not localStorage',()=>{render(<AutomationsPage/>);expect(screen.getByText('Automação remota')).toBeInTheDocument();expect(screen.queryByText('Automação local')).not.toBeInTheDocument();});

  it('shows remote automation state and pauses/reactivates explicitly',async()=>{const user=userEvent.setup();render(<AutomationsPage/>);expect(screen.getByText('Ativa')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Pausar Automação remota'}));await user.click(screen.getByRole('button',{name:'Confirmar pausa'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_pause',{p_workspace:'workspace-1',p_rule_id:'rule-1'});expect(screen.getByText('Pausada')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Reativar Automação remota'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_activate',{p_workspace:'workspace-1',p_rule_id:'rule-1',p_revision_id:'revision-1'});});

  it('hydrates the real graph and activates the published revision when saving',async()=>{mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_read'?{name:'Automação remota',enabled:true,active_revision_id:'revision-1',revisions:[{id:'revision-1',graph:{schema_version:'1',nodes:[{id:'trigger',type:'trigger',subtype:'LEAD_CREATED',position:{x:10,y:10},config:{}},{id:'task',type:'action',subtype:'CREATE_TASK',position:{x:200,y:10},config:{template_id:'Fazer primeiro contato',template_title:'Fazer primeiro contato'}}],edges:[{id:'edge-1',source:'trigger',target:'task'}]}}]}:name==='core_automation_publish'?{rule_id:'rule-1',revision_id:'revision-2'}:{});const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:'Editar Automação remota'}));expect(await screen.findAllByTestId('automation-node')).toHaveLength(2);await user.click(screen.getByRole('button',{name:'Salvar alterações'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_activate',{p_workspace:'workspace-1',p_rule_id:'rule-1',p_revision_id:'revision-2'});});

  it('configures every remote action from snapshot stages and tags and publishes the exact graph',async()=>{mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_publish'?{rule_id:'new-rule',revision_id:'new-revision'}:{});const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:/Nova automação/i}));await user.type(screen.getByLabelText('Nome da automação'),'Fluxo completo');
    for(const label of ['Lead entra no fluxo','Enviar e-mail','Enviar WhatsApp','Aguardar','Mover etapa','Adicionar tag','Condição'])await user.click(screen.getByRole('button',{name:`Adicionar ${label}`}));
    await user.click(screen.getByRole('button',{name:'Configurar e-mail'}));await user.type(screen.getByLabelText('Assunto do e-mail'),'Assunto');await user.type(screen.getByLabelText('Corpo do e-mail'),'Corpo');await user.click(screen.getByRole('button',{name:'Salvar e-mail'}));
    await user.click(screen.getByRole('button',{name:'Configurar WhatsApp'}));await user.type(screen.getByLabelText('Mensagem do WhatsApp'),'Mensagem');await user.click(screen.getByRole('button',{name:'Salvar WhatsApp'}));
    await user.click(screen.getByRole('button',{name:'Configurar período de espera'}));const delay=screen.getByLabelText('Duração da espera');await user.clear(delay);await user.type(delay,'2');await user.selectOptions(screen.getByLabelText('Unidade da espera'),'hours');await user.click(screen.getByRole('button',{name:'Salvar espera'}));
    await user.click(screen.getByRole('button',{name:'Configurar etapa de destino'}));expect(within(screen.getByLabelText('Etapa de destino')).getByRole('option',{name:'Qualificação'})).toBeInTheDocument();await user.selectOptions(screen.getByLabelText('Etapa de destino'),'stage-open');await user.click(screen.getByRole('button',{name:'Salvar etapa'}));
    await user.click(screen.getByRole('button',{name:'Configurar tag da automação'}));expect(within(screen.getByLabelText('Selecionar tag da automação')).getByRole('option',{name:'VIP remoto'})).toBeInTheDocument();await user.selectOptions(screen.getByLabelText('Selecionar tag da automação'),'VIP remoto');await user.click(screen.getByRole('button',{name:'Salvar tag'}));
    await user.click(screen.getByRole('button',{name:'Configurar condição'}));await user.selectOptions(screen.getByLabelText('Tipo da condição'),'STAGE_EQUALS');await user.selectOptions(screen.getByLabelText('Etapa da condição'),'stage-won');await user.click(screen.getByRole('button',{name:'Salvar condição'}));
    await user.click(screen.getByRole('button',{name:'Salvar automação'}));
    expect(mocked.rpc).toHaveBeenCalledWith('core_automation_publish',expect.objectContaining({p_graph:expect.objectContaining({nodes:expect.arrayContaining([expect.objectContaining({subtype:'SEND_EMAIL',config:{subject:'Assunto',body:'Corpo'}}),expect.objectContaining({subtype:'SEND_WHATSAPP',config:{message:'Mensagem'}}),expect.objectContaining({subtype:'WAIT',config:{delay:2,unit:'hours'}}),expect.objectContaining({subtype:'MOVE_STAGE',config:{stage_id:'stage-open'}}),expect.objectContaining({subtype:'ADD_TAG',config:{tag_name:'VIP remoto'}}),expect.objectContaining({type:'condition',subtype:'STAGE_EQUALS',config:{stage_id:'stage-won'}})])})}));
  },15000);

  it('blocks publish with visible errors unless there is one trigger, an action, and complete configs',async()=>{const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:/Nova automação/i}));await user.type(screen.getByLabelText('Nome da automação'),'Inválida');await user.click(screen.getByRole('button',{name:'Adicionar Condição'}));await user.click(screen.getByRole('button',{name:'Salvar automação'}));expect(screen.getByRole('alert')).toHaveTextContent('exatamente um gatilho');await user.click(screen.getByRole('button',{name:'Adicionar Lead entra no fluxo'}));await user.click(screen.getByRole('button',{name:'Salvar automação'}));expect(screen.getByRole('alert')).toHaveTextContent('pelo menos uma ação');await user.click(screen.getByRole('button',{name:'Excluir Condição'}));await user.click(screen.getByRole('button',{name:'Adicionar Enviar e-mail'}));await user.click(screen.getByRole('button',{name:'Salvar automação'}));expect(screen.getByRole('alert')).toHaveTextContent('Configure o e-mail');expect(mocked.rpc).not.toHaveBeenCalledWith('core_automation_publish',expect.anything());});
});
