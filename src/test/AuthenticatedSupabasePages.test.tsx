import {render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';

const mocked=vi.hoisted(()=>({rpc:vi.fn(),remoteInsert:vi.fn(),remoteUpdate:vi.fn(),remoteDelete:vi.fn(),listWebhooks:vi.fn(),snapshot:null as any}));
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
vi.mock('../lib/webhooks',()=>({listWebhooks:mocked.listWebhooks}));

import {CampaignsPage} from '../pages/CampaignsPage';
import {SegmentsPage} from '../pages/SegmentsPage';
import {ReportsPage} from '../pages/ReportsPage';
import {AutomationsPage} from '../pages/AutomationsPage';
import {PipelinePage} from '../pages/PipelinePage';
import {ContactsPage} from '../pages/ContactsPage';
import {UserMenu} from '../components/layout/UserMenu';

const baseSnapshot={
  workspace:{id:'workspace-1',name:'Workspace'},membership:{user_id:'user-1'},
  contacts:[{id:'contact-1',name:'Contato remoto',email:'remote@example.com',phone:null,company:'Remota',source:'Indicação',status:'qualified',created_at:'2026-10-01T00:00:00Z'},{id:'contact-2',name:'Contato fora do segmento',email:'other@example.com',phone:null,company:'Outra',source:'Evento',status:'qualified',created_at:'2026-10-02T00:00:00Z'}],
  pipelines:[{id:'pipeline-1',name:'Pipeline remota',is_default:true,created_at:'2026-10-01T00:00:00Z'}],stages:[{id:'stage-open',name:'Qualificação',outcome:'open',position:0,pipeline_id:'pipeline-1'},{id:'stage-won',name:'Ganho',outcome:'won',position:1,pipeline_id:'pipeline-1'}],
  deals:[{id:'deal-1',pipeline_id:'pipeline-1',contact_id:'contact-1',stage_id:'stage-won',status:'won',value:'15000',owner_id:'user-1',name:'Venda remota'},{id:'deal-2',pipeline_id:'pipeline-1',contact_id:'contact-2',stage_id:'stage-open',status:'open',value:'0',owner_id:'user-1',name:'Venda fora do segmento'}],
  tasks:[{id:'task-1',title:'Tarefa remota',status:'todo',priority:'high',assigned_to:'user-1',due_at:'2026-10-20T12:00:00Z'}],
  tags:[{id:'tag-1',name:'VIP remoto',color:'#123456'}],contactTags:[],notifications:[],members:[{user_id:'user-1',full_name:'Pessoa Remota'},{user_id:'user-2',full_name:'Segunda Pessoa'}],teamGroups:[{id:'team-1',name:'Equipe Vendas',member_ids:['user-1','user-2']}],summary:null,
  campaigns:[{id:'campaign-1',name:'Campanha remota',channel:'email',budget:'5000',spent:'1200',status:'active',start_date:'2026-10-01',end_date:null,created_at:'2026-10-01T00:00:00Z'}],
  segmentLists:[{id:'list-1',name:'Segmento remoto',description:'Somente Supabase',category:'MARKETING',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}],
  segmentMembers:[{id:'member-1',list_id:'list-1',contact_id:'contact-1',deal_id:null,reason:null,added_at:'2026-10-01T00:00:00Z'}],
  automations:[{id:'rule-1',name:'Automação remota',enabled:true,creator_id:'user-1',active_revision_id:'revision-1',updated_at:'2026-10-01T00:00:00Z'}]
  ,importHistory:[]
};

describe('authenticated pages use only the remote snapshot',()=>{
  beforeEach(()=>{mocked.snapshot=structuredClone(baseSnapshot);mocked.rpc.mockReset().mockResolvedValue([]);mocked.remoteInsert.mockReset().mockResolvedValue({});mocked.remoteUpdate.mockReset().mockResolvedValue({});mocked.remoteDelete.mockReset().mockResolvedValue({});mocked.listWebhooks.mockReset().mockResolvedValue([]);localStorage.clear();localStorage.setItem('marketing_core_segment_lists',JSON.stringify([{id:'local',name:'Segmento local',leads:99}]));localStorage.setItem('marketing_core_automations',JSON.stringify([{id:'local',name:'Automação local',nodes:[],connections:[],createdAt:'hoje'}]));});

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

  it('edits all segment filters and recalculates remote membership atomically',async()=>{mocked.snapshot.segmentLists[0].filters={tag:'',status:'qualified',source:'Indicação'};const user=userEvent.setup();render(<SegmentsPage/>);await user.click(screen.getByRole('button',{name:'Editar Segmento remoto'}));expect(screen.getByRole('group',{name:'Editar filtros da lista'})).toBeInTheDocument();await user.selectOptions(screen.getByLabelText('Editar filtro por tag'),'VIP remoto');await user.selectOptions(screen.getByLabelText('Editar filtro por status'),'Qualificado');await user.selectOptions(screen.getByLabelText('Editar filtro por origem'),'Evento');await user.click(screen.getByRole('button',{name:'Salvar alterações'}));expect(mocked.rpc).toHaveBeenCalledWith('core_segment_list_update_with_members',expect.objectContaining({p_workspace:'workspace-1',p_list_id:'list-1',p_filters:expect.objectContaining({tag:'VIP remoto',status:'Qualificado',source:'Evento'}),p_contact_ids:[]}));});

  it('renders and filters with remote segment membership without leaking localStorage lists',async()=>{const user=userEvent.setup();const view=render(<SegmentsPage/>);expect(screen.getByText('Segmento remoto')).toBeInTheDocument();expect(screen.queryByText('Segmento local')).not.toBeInTheDocument();view.unmount();render(<PipelinePage/>);await user.click(screen.getByRole('button',{name:'Ganhos'}));await user.click(screen.getByRole('button',{name:'Filtrar pipeline'}));const segment=screen.getByLabelText('Filtrar por lista de segmentação');expect(within(segment).getByRole('option',{name:'Segmento remoto'})).toBeInTheDocument();expect(within(segment).queryByRole('option',{name:'Segmento local'})).not.toBeInTheDocument();await user.selectOptions(segment,'list-1');await user.click(screen.getByRole('button',{name:'Aplicar filtros'}));expect(screen.getByTestId('deal-card-deal-1')).toBeInTheDocument();expect(screen.queryByTestId('deal-card-deal-2')).not.toBeInTheDocument();});

  it('shows lost deals in the stage where they were lost',async()=>{mocked.snapshot.deals[0].status='lost';mocked.snapshot.deals[0].stage_id='stage-open';const user=userEvent.setup();render(<PipelinePage/>);await user.click(screen.getByRole('button',{name:'Perdidos'}));const originalStage=screen.getByTestId('pipeline-stage-Qualificação');expect(within(originalStage).getByTestId('deal-card-deal-1')).toBeInTheDocument();expect(screen.queryByTestId('deal-card-deal-2')).not.toBeInTheDocument();});

  it('reports fresh remote presence and keeps the authenticated heartbeat/status in Supabase',async()=>{mocked.rpc.mockImplementation(async(name:string)=>name==='core_presence_report'?[{user_id:'user-1',full_name:'Pessoa Remota',status:'online',updated_at:'2026-10-29T14:00:00Z',is_online:true}]:name==='core_presence_get'?{status:'online'}:name==='core_presence_heartbeat'?{status:'online'}:name==='core_presence_set'?{status:'meeting'}:{});const user=userEvent.setup();const view=render(<ReportsPage/>);expect(screen.getAllByText((value)=>value.replace(/\s/g,' ')==='R$ 15.000').length).toBeGreaterThan(0);await user.click(screen.getByRole('button',{name:'Presença da equipe'}));expect((await screen.findAllByText('Online')).length).toBeGreaterThan(0);expect(screen.getByText('Pessoa Remota')).toBeInTheDocument();expect(screen.queryByText(/presença indisponível/i)).not.toBeInTheDocument();expect(mocked.rpc).toHaveBeenCalledWith('core_presence_report',expect.objectContaining({p_workspace:'workspace-1'}));view.unmount();render(<MemoryRouter><UserMenu userName="Pessoa Remota" onLogout={()=>{}}/></MemoryRouter>);const status=await screen.findByRole('button',{name:/Alterar status. Atual: Online/i});expect(status).toBeEnabled();await waitFor(()=>expect(mocked.rpc).toHaveBeenCalledWith('core_presence_heartbeat',{p_workspace:'workspace-1'}));await user.click(status);await user.click(screen.getByRole('menuitemradio',{name:/Em reunião/i}));expect(mocked.rpc).toHaveBeenCalledWith('core_presence_set',{p_workspace:'workspace-1',p_status:'meeting'});expect(screen.getByRole('button',{name:/Alterar status. Atual: Em reunião/i})).toBeInTheDocument();});

  it('creates an authenticated negotiation through the real remote deal mutation',async()=>{mocked.snapshot.contacts[0].phone='31999995125';mocked.remoteInsert.mockResolvedValue({id:'deal-created'});const user=userEvent.setup();render(<PipelinePage/>);await user.click(screen.getByRole('button',{name:/Nova negociação/i}));await user.type(screen.getByLabelText('Nome da negociação'),'Venda produto');await user.type(screen.getByLabelText('Telefone'),'31999995125');await user.click(screen.getByRole('button',{name:'Vincular Contato remoto'}));await user.type(screen.getByLabelText('Valor da negociação'),'10000');await user.click(screen.getByRole('button',{name:'Criar negociação'}));expect(mocked.remoteInsert).toHaveBeenCalledWith('core_deals',expect.objectContaining({contact_id:'contact-1',pipeline_id:'pipeline-1',name:'Venda produto',value:'10000'}));expect(screen.queryByRole('dialog',{name:'Registrar nova negociação'})).not.toBeInTheDocument();});

  it('creates a lead through the authenticated remote contact mutation and only closes after success',async()=>{mocked.remoteInsert.mockResolvedValue({id:'contact-created'});const user=userEvent.setup();render(<ContactsPage/>);await user.click(screen.getByRole('button',{name:/Novo lead/i}));await user.type(screen.getByPlaceholderText('Nome completo'),'Lead remoto criado');await user.type(screen.getByPlaceholderText('(31) 99999-9999'),'31970000002');await user.selectOptions(screen.getByLabelText('Origem do lead'),'Landing page');await user.click(screen.getByRole('button',{name:'Cadastrar lead'}));expect(mocked.remoteInsert).toHaveBeenCalledWith('core_contacts',expect.objectContaining({name:'Lead remoto criado',phone:'+55 (31) 97000-0002',source:'Landing page'}),true);expect(screen.queryByRole('dialog',{name:'Cadastrar novo lead'})).not.toBeInTheDocument();});

  it('paginates all 212 authenticated contacts and exposes the last page',async()=>{
    mocked.snapshot.contacts=Array.from({length:212},(_,index)=>({
      id:`contact-${index+1}`,workspace_id:'workspace-1',name:`Contato ${String(index+1).padStart(3,'0')}`,
      email:`contato${index+1}@example.com`,phone:`319${String(index+1).padStart(8,'0')}`,company:'Empresa',source:'Importação',
      status:'new',notes:null,custom_fields:null,created_at:'2026-10-30T10:01:00Z',updated_at:'2026-10-30T10:01:00Z'
    }));
    const user=userEvent.setup();render(<ContactsPage/>);
    expect(screen.getByText('Exibindo 1–10 de 212 leads')).toBeInTheDocument();
    expect(screen.getByText('Contato 001')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Página 22'}));
    expect(screen.getByText('Exibindo 211–212 de 212 leads')).toBeInTheDocument();
    expect(screen.getByText('Contato 211')).toBeInTheDocument();
    expect(screen.getByText('Contato 212')).toBeInTheDocument();
  });

  it('keeps lead creation open and exposes the exact Supabase failure',async()=>{mocked.remoteInsert.mockRejectedValue(new Error('permission denied for table core_automation_events'));const user=userEvent.setup();render(<ContactsPage/>);await user.click(screen.getByRole('button',{name:/Novo lead/i}));await user.type(screen.getByPlaceholderText('Nome completo'),'Lead remoto falhou');await user.type(screen.getByPlaceholderText('(31) 99999-9999'),'31970000003');await user.selectOptions(screen.getByLabelText('Origem do lead'),'Landing page');await user.click(screen.getByRole('button',{name:'Cadastrar lead'}));const dialog=screen.getByRole('dialog',{name:'Cadastrar novo lead'});expect(within(dialog).getByRole('alert')).toHaveTextContent('permission denied for table core_automation_events');expect(screen.queryByText('Lead remoto falhou')).not.toBeInTheDocument();});

  it('shows the remote error inside the negotiation dialog instead of appearing to ignore the button',async()=>{mocked.snapshot.contacts[0].phone='31999995125';mocked.remoteInsert.mockRejectedValue(new Error('Falha real do Supabase'));const user=userEvent.setup();render(<PipelinePage/>);await user.click(screen.getByRole('button',{name:/Nova negociação/i}));await user.type(screen.getByLabelText('Nome da negociação'),'Venda produto');await user.type(screen.getByLabelText('Telefone'),'31999995125');await user.click(screen.getByRole('button',{name:'Vincular Contato remoto'}));await user.click(screen.getByRole('button',{name:'Criar negociação'}));const dialog=screen.getByRole('dialog',{name:'Registrar nova negociação'});expect(within(dialog).getByRole('alert')).toHaveTextContent('Falha real do Supabase');});

  it('lists automation rules through the authenticated remote snapshot, not localStorage',()=>{render(<AutomationsPage/>);expect(screen.getByText('Automação remota')).toBeInTheDocument();expect(screen.queryByText('Automação local')).not.toBeInTheDocument();});

  it('shows automation execution metrics and opens the per-step report',async()=>{
    mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_metrics'?[{rule_id:'rule-1',entered_count:23,running_count:2,completed_count:20,failed_count:1}]:name==='core_automation_report'?{summary:{entered:23,running:2,completed:20,failed:1},steps:[{node_id:'deal',label:'Criar negociação',reached:22,completed:21,failed:1}],leads:[{contact_id:'contact-1',contact_name:'Contato remoto',status:'running',current_step:'Criar negociação'}]}:[]);
    const user=userEvent.setup();render(<AutomationsPage/>);
    expect(await screen.findByText((_,element)=>element?.textContent==='23 leads entraram')).toBeInTheDocument();
    expect(screen.getByText((_,element)=>element?.textContent==='20 finalizaram')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Relatório Automação remota'}));
    const dialog=await screen.findByRole('dialog',{name:'Relatório da automação Automação remota'});
    expect(within(dialog).getAllByText('Criar negociação')).toHaveLength(2);
    expect(within(dialog).getByText('Contato remoto')).toBeInTheDocument();
    expect(mocked.rpc).toHaveBeenCalledWith('core_automation_report',{p_workspace:'workspace-1',p_rule_id:'rule-1'});
  });

  it('reports how many existing segment leads were queued when the automation is saved',async()=>{
    mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_publish'?{rule_id:'new-rule',revision_id:'new-revision'}:name==='core_automation_activate'?{rule_id:'new-rule',revision_id:'new-revision',enabled:true,queued_count:23}:[]);
    const user=userEvent.setup();render(<AutomationsPage/>);
    await user.click(screen.getByRole('button',{name:/Nova automação/i}));
    await user.type(screen.getByLabelText('Nome da automação'),'Ativar lista atual');
    await user.click(screen.getByRole('button',{name:'Adicionar Lead entra no fluxo'}));
    await user.click(screen.getByRole('button',{name:'Configurar origem dos leads'}));
    await user.selectOptions(screen.getByLabelText('Tipo de origem dos leads'),'segment');
    await user.selectOptions(screen.getByLabelText('Origem específica dos leads'),'list-1');
    await user.click(screen.getByRole('button',{name:'Salvar origem'}));
    await user.click(screen.getByRole('button',{name:'Adicionar Adicionar tag'}));
    await user.click(screen.getByRole('button',{name:'Configurar tag da automação'}));
    await user.selectOptions(screen.getByLabelText('Selecionar tag da automação'),'VIP remoto');
    await user.click(screen.getByRole('button',{name:'Salvar tag'}));
    await user.click(screen.getByRole('button',{name:'Salvar automação'}));
    expect(await screen.findByRole('status')).toHaveTextContent('23 leads existentes foram adicionados ao fluxo');
  },15000);

  it('shows remote automation state and pauses/reactivates explicitly',async()=>{const user=userEvent.setup();render(<AutomationsPage/>);expect(screen.getByText('Ativa')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Pausar Automação remota'}));await user.click(screen.getByRole('button',{name:'Confirmar pausa'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_pause',{p_workspace:'workspace-1',p_rule_id:'rule-1'});expect(screen.getByText('Pausada')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Reativar Automação remota'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_activate',{p_workspace:'workspace-1',p_rule_id:'rule-1',p_revision_id:'revision-1'});});

  it('opens a remote rule with zero revisions so its first graph can be built',async()=>{mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_read'?{name:'Automação sem revisão',revisions:[]}:[]);const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:'Editar Automação remota'}));expect(await screen.findByRole('heading',{name:'Editar automação'})).toBeInTheDocument();expect(screen.getByLabelText('Nome da automação')).toHaveValue('Automação sem revisão');expect(screen.queryAllByTestId('automation-node')).toHaveLength(0);});

  it('shows and saves a created Leads Hub webhook as the automation entry source',async()=>{
    mocked.listWebhooks.mockResolvedValue([{id:'webhook-1',public_id:'public-id',name:'Testando',url:'https://example.invalid/hook',enabled:true,created_at:'2026-10-31T12:00:00Z',last_used_at:null}]);
    mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_publish'?{rule_id:'new-rule',revision_id:'new-revision'}:{});
    const user=userEvent.setup();render(<AutomationsPage/>);
    await user.click(screen.getByRole('button',{name:/Nova automação/i}));
    await user.type(screen.getByLabelText('Nome da automação'),'Negociação via Testando');
    await user.click(screen.getByRole('button',{name:'Adicionar Lead entra no fluxo'}));
    await user.click(screen.getByRole('button',{name:'Configurar origem dos leads'}));
    await user.selectOptions(screen.getByLabelText('Tipo de origem dos leads'),'webhook');
    expect(await screen.findByRole('option',{name:'Testando'})).toBeInTheDocument();
    expect(screen.getByRole('option',{name:'Todos os webhooks ativos'})).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Origem específica dos leads'),'webhook-1');
    await user.click(screen.getByRole('button',{name:'Salvar origem'}));
    await user.click(screen.getByRole('button',{name:'Adicionar Criar tarefa'}));
    await user.click(screen.getByRole('button',{name:'Configurar tarefa da automação'}));
    await user.selectOptions(screen.getByLabelText('Selecionar tarefa configurada'),'Fazer primeiro contato');
    await user.click(screen.getByRole('button',{name:'Salvar tarefa'}));
    await user.click(screen.getByRole('button',{name:'Salvar automação'}));
    expect(mocked.rpc).toHaveBeenCalledWith('core_automation_publish',expect.objectContaining({p_graph:expect.objectContaining({nodes:expect.arrayContaining([expect.objectContaining({type:'trigger',subtype:'WEBHOOK_RECEIVED',config:expect.objectContaining({source_type:'webhook',source_id:'webhook-1',source_label:'Testando'})})])})}));
  },15000);

  it('does not save an existing webhook source when its reload fails',async()=>{
    const user=userEvent.setup();render(<AutomationsPage/>);
    await user.click(screen.getByRole('button',{name:/Nova automação/i}));
    await user.type(screen.getByLabelText('Nome da automação'),'Webhook fail-safe');
    await user.click(screen.getByRole('button',{name:'Adicionar Lead entra no fluxo'}));
    await user.click(screen.getByRole('button',{name:'Configurar origem dos leads'}));
    mocked.listWebhooks.mockResolvedValueOnce([{id:'webhook-1',public_id:'public-id',name:'Testando',url:'https://example.invalid/hook',enabled:true,created_at:'2026-10-31T12:00:00Z',last_used_at:null}]);
    await user.selectOptions(screen.getByLabelText('Tipo de origem dos leads'),'webhook');
    expect(await screen.findByRole('option',{name:'Testando'})).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Origem específica dos leads'),'webhook-1');
    await user.click(screen.getByRole('button',{name:'Salvar origem'}));
    await user.click(screen.getByRole('button',{name:'Configurar origem dos leads'}));
    mocked.listWebhooks.mockRejectedValueOnce(new Error('reload failed'));
    await user.selectOptions(screen.getByLabelText('Tipo de origem dos leads'),'segment');
    await user.selectOptions(screen.getByLabelText('Tipo de origem dos leads'),'webhook');
    expect(await screen.findByRole('alert')).toHaveTextContent('reload failed');
    const save=screen.getByRole('button',{name:'Salvar origem'});
    expect(save).toBeDisabled();
    await user.click(save);
    expect(save).toBeDisabled();
    expect(screen.getByRole('dialog',{name:'Configurar origem dos leads'})).toBeInTheDocument();
    expect(mocked.rpc.mock.calls.filter(([name])=>name==='core_automation_publish')).toHaveLength(0);
    await user.click(within(screen.getByRole('dialog',{name:'Configurar origem dos leads'})).getByRole('button',{name:'Cancelar'}));
    expect(screen.getByText('Testando')).toBeInTheDocument();
  });

  it('preserves and saves the all-active-webhooks source when reopening a trigger',async()=>{
    mocked.listWebhooks.mockResolvedValue([{id:'webhook-1',public_id:'public-id',name:'Testando',url:'https://example.invalid/hook',enabled:true,created_at:'2026-10-31T12:00:00Z',last_used_at:null}]);
    mocked.rpc.mockImplementation(async(name:string)=>{
      if(name==='core_automation_read')return {name:'Automação wildcard',enabled:true,active_revision_id:'revision-1',revisions:[{id:'revision-1',graph:{schema_version:'1',nodes:[{id:'trigger',type:'trigger',subtype:'WEBHOOK_RECEIVED',position:{x:10,y:10},config:{source_type:'webhook',source_id:'webhook-all',source_label:'Todos os webhooks ativos'}},{id:'task',type:'action',subtype:'CREATE_TASK',position:{x:200,y:10},config:{template_id:'Fazer primeiro contato',template_title:'Fazer primeiro contato'}}],edges:[{id:'edge-1',source:'trigger',target:'task'}]}}]};
      if(name==='core_automation_publish')return {rule_id:'rule-1',revision_id:'revision-2'};
      return [];
    });
    const user=userEvent.setup();render(<AutomationsPage/>);
    await user.click(screen.getByRole('button',{name:'Editar Automação remota'}));
    expect(await screen.findAllByTestId('automation-node')).toHaveLength(2);
    await user.click(screen.getByRole('button',{name:'Configurar origem dos leads'}));
    expect(await screen.findByRole('option',{name:'Testando'})).toBeInTheDocument();
    const source=screen.getByLabelText('Origem específica dos leads');
    expect(source).toHaveValue('webhook-all');
    await user.click(screen.getByRole('button',{name:'Salvar origem'}));
    await user.click(screen.getByRole('button',{name:'Salvar alterações'}));
    expect(mocked.rpc).toHaveBeenCalledWith('core_automation_publish',expect.objectContaining({p_graph:expect.objectContaining({nodes:expect.arrayContaining([expect.objectContaining({type:'trigger',subtype:'WEBHOOK_RECEIVED',config:expect.objectContaining({source_type:'webhook',source_id:'webhook-all'})})])})}));
  });

  it('deletes a remote automation through core_automation_delete without replacing pause',async()=>{const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:'Excluir Automação remota'}));const dialog=screen.getByRole('dialog',{name:'Excluir automação'});expect(within(dialog).getByText(/removida permanentemente/i)).toBeInTheDocument();await user.click(within(dialog).getByRole('button',{name:'Confirmar exclusão'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_delete',{p_workspace:'workspace-1',p_rule_id:'rule-1'});expect(screen.queryByText('Automação remota')).not.toBeInTheDocument();});

  it('hydrates the real graph and activates the published revision when saving',async()=>{mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_read'?{name:'Automação remota',enabled:true,active_revision_id:'revision-1',revisions:[{id:'revision-1',graph:{schema_version:'1',nodes:[{id:'trigger',type:'trigger',subtype:'LEAD_CREATED',position:{x:10,y:10},config:{}},{id:'task',type:'action',subtype:'CREATE_TASK',position:{x:200,y:10},config:{template_id:'Fazer primeiro contato',template_title:'Fazer primeiro contato'}}],edges:[{id:'edge-1',source:'trigger',target:'task'}]}}]}:name==='core_automation_publish'?{rule_id:'rule-1',revision_id:'revision-2'}:{});const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:'Editar Automação remota'}));expect(await screen.findAllByTestId('automation-node')).toHaveLength(2);await user.click(screen.getByRole('button',{name:'Salvar alterações'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_activate',{p_workspace:'workspace-1',p_rule_id:'rule-1',p_revision_id:'revision-2'});});

  it('configures Criar negociação without a configurable name and publishes CREATE_DEAL',async()=>{mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_publish'?{rule_id:'new-rule',revision_id:'new-revision'}:{});const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:/Nova automação/i}));await user.type(screen.getByLabelText('Nome da automação'),'Criar venda');await user.click(screen.getByRole('button',{name:'Adicionar Lead entra no fluxo'}));await user.click(screen.getByRole('button',{name:'Adicionar Criar negociação'}));expect(screen.getByText('Cria uma negociação para o lead')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Configurar negociação da automação'}));const dialog=screen.getByRole('dialog',{name:'Configurar negociação da automação'});expect(within(dialog).getByRole('option',{name:'Pessoa Remota'})).toBeInTheDocument();expect(screen.queryByLabelText('Nome da negociação')).not.toBeInTheDocument();expect(within(dialog).getByText(/nome informado pelo lead/i)).toBeInTheDocument();await user.selectOptions(screen.getByLabelText('Responsável pela negociação'),'user-1');await user.selectOptions(screen.getByLabelText('Pipeline inicial'),'pipeline-1');await user.selectOptions(screen.getByLabelText('Etapa inicial'),'stage-open');await user.click(screen.getByRole('button',{name:'Salvar negociação'}));expect(screen.getByText('Pipeline remota · Pessoa Remota')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Salvar automação'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_publish',expect.objectContaining({p_graph:expect.objectContaining({nodes:expect.arrayContaining([expect.objectContaining({type:'action',subtype:'CREATE_DEAL',config:{owner_id:'user-1',pipeline_id:'pipeline-1',stage_id:'stage-open'}})])})}));},15000);

  it('hydrates a legacy CREATE_DEAL node while ignoring its old configured name',async()=>{mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_read'?{name:'Automação remota',revisions:[{graph:{schema_version:'1',nodes:[{id:'trigger',type:'trigger',subtype:'LEAD_CREATED',position:{x:10,y:10},config:{}},{id:'deal',type:'action',subtype:'CREATE_DEAL',position:{x:200,y:10},config:{owner_id:'user-1',name:'Negociação hidratada',pipeline_id:'pipeline-1',stage_id:'stage-open'}}],edges:[]}}]}:{});const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:'Editar Automação remota'}));expect(await screen.findByText('Pipeline remota · Pessoa Remota')).toBeInTheDocument();expect(screen.queryByText(/Negociação hidratada/)).not.toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Configurar negociação da automação'}));expect(screen.getByLabelText('Responsável pela negociação')).toHaveValue('user-1');expect(screen.queryByLabelText('Nome da negociação')).not.toBeInTheDocument();});

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

  it('configures deterministic weighted team assignment and rejects totals different from 100%',async()=>{mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_publish'?{rule_id:'new-rule',revision_id:'new-revision'}:{});const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:/Nova automação/i}));await user.type(screen.getByLabelText('Nome da automação'),'Distribuir vendas');await user.click(screen.getByRole('button',{name:'Adicionar Lead entra no fluxo'}));await user.click(screen.getByRole('button',{name:'Adicionar Criar negociação'}));await user.click(screen.getByRole('button',{name:'Configurar negociação da automação'}));await user.selectOptions(screen.getByLabelText('Responsável pela negociação'),'team:team-1');await user.click(screen.getByRole('button',{name:'Configurar distribuição da equipe'}));const ana=screen.getByLabelText('Percentual de Pessoa Remota');const bia=screen.getByLabelText('Percentual de Segunda Pessoa');await user.clear(ana);await user.type(ana,'80');expect(screen.getByRole('alert')).toHaveTextContent('100%');await user.clear(bia);await user.type(bia,'20');await user.click(screen.getByRole('button',{name:'Salvar distribuição'}));await user.selectOptions(screen.getByLabelText('Pipeline inicial'),'pipeline-1');await user.selectOptions(screen.getByLabelText('Etapa inicial'),'stage-open');await user.click(screen.getByRole('button',{name:'Salvar negociação'}));expect(screen.getByText(/Equipe Vendas · 2 pessoas · 100%/)).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Salvar automação'}));expect(mocked.rpc).toHaveBeenCalledWith('core_automation_publish',expect.objectContaining({p_graph:expect.objectContaining({nodes:expect.arrayContaining([expect.objectContaining({subtype:'CREATE_DEAL',config:{team_id:'team-1',distribution:[{user_id:'user-1',percentage:80},{user_id:'user-2',percentage:20}],pipeline_id:'pipeline-1',stage_id:'stage-open'}})])})}));},15000);

  it('allows excluding a team member from deal assignment',async()=>{
    mocked.rpc.mockImplementation(async(name:string)=>name==='core_automation_publish'?{rule_id:'new-rule',revision_id:'new-revision'}:{});
    const user=userEvent.setup();
    render(<AutomationsPage/>);
    await user.click(screen.getByRole('button',{name:/Nova automação/i}));
    await user.type(screen.getByLabelText('Nome da automação'),'Equipe sem Bia');
    await user.click(screen.getByRole('button',{name:'Adicionar Lead entra no fluxo'}));
    await user.click(screen.getByRole('button',{name:'Adicionar Criar negociação'}));
    await user.click(screen.getByRole('button',{name:'Configurar negociação da automação'}));
    await user.selectOptions(screen.getByLabelText('Responsável pela negociação'),'team:team-1');
    await user.click(screen.getByRole('button',{name:'Configurar distribuição da equipe'}));
    await user.click(screen.getByRole('checkbox',{name:'Incluir Segunda Pessoa'}));
    const ana=screen.getByLabelText('Percentual de Pessoa Remota');
    await user.clear(ana);
    await user.type(ana,'100');
    await user.click(screen.getByRole('button',{name:'Salvar distribuição'}));
    await user.selectOptions(screen.getByLabelText('Pipeline inicial'),'pipeline-1');
    await user.selectOptions(screen.getByLabelText('Etapa inicial'),'stage-open');
    await user.click(screen.getByRole('button',{name:'Salvar negociação'}));
    await user.click(screen.getByRole('button',{name:'Salvar automação'}));
    expect(mocked.rpc).toHaveBeenCalledWith('core_automation_publish',expect.objectContaining({p_graph:expect.objectContaining({nodes:expect.arrayContaining([expect.objectContaining({subtype:'CREATE_DEAL',config:{team_id:'team-1',distribution:[{user_id:'user-1',percentage:100}],pipeline_id:'pipeline-1',stage_id:'stage-open'}})])})}));
  },15000);

  it('deletes a negotiation remotely after explicit confirmation without deleting its lead',async()=>{const user=userEvent.setup();render(<PipelinePage/>);await user.click(screen.getByRole('button',{name:'Ganhos'}));await user.click(screen.getByRole('button',{name:/Abrir negociação Venda remota/i}));await user.click(screen.getByRole('button',{name:'Excluir negociação'}));const dialog=screen.getByRole('dialog',{name:'Confirmar exclusão da negociação'});expect(within(dialog).getByText(/lead vinculado continuará salvo/i)).toBeInTheDocument();await user.click(within(dialog).getByRole('button',{name:'Excluir negociação'}));expect(mocked.remoteDelete).toHaveBeenCalledWith('core_deals','deal-1');expect(mocked.remoteDelete).not.toHaveBeenCalledWith('core_contacts',expect.anything());expect(screen.getByRole('status')).toHaveTextContent('Negociação excluída com sucesso.');});

  it('blocks publish with visible errors unless there is one trigger, an action, and complete configs',async()=>{const user=userEvent.setup();render(<AutomationsPage/>);await user.click(screen.getByRole('button',{name:/Nova automação/i}));await user.type(screen.getByLabelText('Nome da automação'),'Inválida');await user.click(screen.getByRole('button',{name:'Adicionar Condição'}));await user.click(screen.getByRole('button',{name:'Salvar automação'}));expect(screen.getByRole('alert')).toHaveTextContent('exatamente um gatilho');await user.click(screen.getByRole('button',{name:'Adicionar Lead entra no fluxo'}));await user.click(screen.getByRole('button',{name:'Salvar automação'}));expect(screen.getByRole('alert')).toHaveTextContent('pelo menos uma ação');await user.click(screen.getByRole('button',{name:'Excluir Condição'}));await user.click(screen.getByRole('button',{name:'Adicionar Enviar e-mail'}));await user.click(screen.getByRole('button',{name:'Salvar automação'}));expect(screen.getByRole('alert')).toHaveTextContent('Configure o e-mail');expect(mocked.rpc).not.toHaveBeenCalledWith('core_automation_publish',expect.anything());});
});
