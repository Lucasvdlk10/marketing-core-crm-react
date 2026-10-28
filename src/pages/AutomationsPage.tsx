import {useEffect,useMemo,useRef,useState,type DragEvent} from 'react';
import {Clock,GitBranch,ListTodo,Mail,MessageCircle,MoveRight,Pencil,Play,Settings2,Tag,Trash2,Zap} from 'lucide-react';
import {PageHeader,EmptyState} from '../components/common/PageHeader';
import {mockTasks} from '../data/mockCrmData';
import {getCalendarTaskRecords} from '../lib/calendarTasks';
import {getAllLeadTags} from '../lib/leadRecords';
import {getRemoteSnapshot,getRemoteWorkspaceId,isRemoteMode,remoteRpc} from '../lib/remoteCrm';
import {automationGraphFromUi,automationGraphToUi,type AutomationGraphV1} from '../lib/automationGraph';
import {useRemoteSnapshot} from '../lib/useRemoteSnapshot';

type ActionKind='trigger'|'email'|'whatsapp'|'task'|'wait'|'stage'|'tag'|'condition';
type EntrySourceType='segment'|'wordpress'|'webhook'|'facebook'|'api'|'manual';
type EntrySource={type:EntrySourceType;id:string;label:string};
type TaskTemplate={id:string;title:string};
type WaitConfig={amount:number;unit:'hours'|'days'|'weeks'|'months'};
type FlowNode={id:string;kind:ActionKind;label:string;x:number;y:number;entrySource?:EntrySource;taskTemplate?:TaskTemplate;waitConfig?:WaitConfig;tagName?:string};
type Connection={from:string;to:string};
type Automation={id:string;name:string;nodes:FlowNode[];connections:Connection[];createdAt:string;enabled?:boolean;activeRevisionId?:string|null};

const palette=[
  {kind:'trigger' as const,label:'Lead entra no fluxo',description:'Inicia a automação',Icon:Zap},
  {kind:'email' as const,label:'Enviar e-mail',description:'Dispara uma mensagem',Icon:Mail},
  {kind:'whatsapp' as const,label:'Enviar WhatsApp',description:'Envia mensagem ao lead',Icon:MessageCircle},
  {kind:'task' as const,label:'Criar tarefa',description:'Atribui uma ação à equipe',Icon:ListTodo},
  {kind:'wait' as const,label:'Aguardar',description:'Pausa por um período',Icon:Clock},
  {kind:'stage' as const,label:'Mover etapa',description:'Atualiza o funil',Icon:MoveRight},
  {kind:'tag' as const,label:'Adicionar tag',description:'Classifica o lead',Icon:Tag},
  {kind:'condition' as const,label:'Condição',description:'Divide o caminho do fluxo',Icon:GitBranch},
];

const sourceTypeLabels:Record<EntrySourceType,string>={segment:'Lista de segmentação',wordpress:'Formulário do WordPress',webhook:'Webhook de entrada',facebook:'Formulário do Facebook',api:'API de leads',manual:'Entrada manual no CRM'};
const getSegmentSources=():EntrySource[]=>isRemoteMode()?(getRemoteSnapshot()?.segmentLists||[]).map(item=>({type:'segment',id:item.id,label:item.name})):(()=>{try{const lists=JSON.parse(localStorage.getItem('marketing_core_segment_lists')||'[]');return Array.isArray(lists)?lists.map((item:any,index:number)=>({type:'segment' as const,id:String(item.id||`segment-${index}`),label:String(item.name||item.title||`Lista ${index+1}`)})):[]}catch{return[]}})();
const getEntrySources=(type:EntrySourceType):EntrySource[]=>type==='segment'?getSegmentSources():type==='wordpress'?[{type,id:'wordpress-all',label:'Todos os formulários do Plugin WordPress'},{type,id:'wordpress-main',label:'Formulário principal do site'}]:type==='webhook'?[{type,id:'webhook-lead-created',label:'Webhook de entrada — Lead criado'}]:type==='facebook'?[{type,id:'facebook-lead-ads',label:'Formulários do Facebook Lead Ads'}]:type==='api'?[{type,id:'api-leads',label:'API de entrada de leads'}]:[{type,id:'manual-created',label:'Todo lead criado manualmente no CRM'}];

const getTaskTemplates=():TaskTemplate[]=>{const records=getCalendarTaskRecords();const titles=[...mockTasks.map(task=>task.title),...records.map(task=>task.title)];return[...new Set(titles)].map(title=>({id:title,title}))};

const waitUnitLabels:Record<WaitConfig['unit'],[string,string]>={hours:['hora','horas'],days:['dia','dias'],weeks:['semana','semanas'],months:['mês','meses']};
const formatWait=(config:WaitConfig)=>`${config.amount} ${waitUnitLabels[config.unit][config.amount===1?0:1]}`;

const loadAutomations=():Automation[]=>{try{return JSON.parse(localStorage.getItem('marketing_core_automations')||'[]')}catch{return[]}};

export function AutomationsPage(){
  const remote=isRemoteMode();
  const snapshot=useRemoteSnapshot();
  const[automations,setAutomations]=useState<Automation[]>(()=>remote?(snapshot?.automations||[]).map(item=>({id:item.id,name:item.name,nodes:[],connections:[],createdAt:item.updated_at?new Date(item.updated_at).toLocaleDateString('pt-BR'):'',enabled:item.enabled,activeRevisionId:item.active_revision_id})):loadAutomations());
  const[editing,setEditing]=useState(false);
  const[editingId,setEditingId]=useState<string|null>(null);
  const[deleteTarget,setDeleteTarget]=useState<Automation|null>(null);
  const[name,setName]=useState('');
  const[nodes,setNodes]=useState<FlowNode[]>([]);
  const[connections,setConnections]=useState<Connection[]>([]);
  const[linkSource,setLinkSource]=useState<string|null>(null);
  const[configNodeId,setConfigNodeId]=useState<string|null>(null);
  const[sourceType,setSourceType]=useState<EntrySourceType>('segment');
  const[sourceId,setSourceId]=useState('');
  const[taskConfigNodeId,setTaskConfigNodeId]=useState<string|null>(null);
  const[taskTemplateId,setTaskTemplateId]=useState('');
  const[waitConfigNodeId,setWaitConfigNodeId]=useState<string|null>(null);
  const[waitAmount,setWaitAmount]=useState(1);
  const[waitUnit,setWaitUnit]=useState<WaitConfig['unit']>('days');
  const[tagConfigNodeId,setTagConfigNodeId]=useState<string|null>(null);
  const[selectedTag,setSelectedTag]=useState('');
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const canvasRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(remote)setAutomations((snapshot?.automations||[]).map(item=>({id:item.id,name:item.name,nodes:[],connections:[],createdAt:item.updated_at?new Date(item.updated_at).toLocaleDateString('pt-BR'):'',enabled:item.enabled,activeRevisionId:item.active_revision_id})))},[remote,snapshot]);

  const addNode=(kind:ActionKind,x?:number,y?:number)=>{
    const item=palette.find(entry=>entry.kind===kind)!;
    setNodes(current=>[...current,{id:`node-${Date.now()}-${current.length}`,kind,label:item.label,x:x??90+(current.length%3)*220,y:y??80+Math.floor(current.length/3)*130}]);
  };
  const dropOnCanvas=(event:DragEvent<HTMLDivElement>)=>{
    event.preventDefault();
    const kind=event.dataTransfer.getData('automation-action') as ActionKind;
    const movingId=event.dataTransfer.getData('automation-node');
    const rect=canvasRef.current?.getBoundingClientRect();
    if(!rect)return;
    const x=Math.max(12,event.clientX-rect.left-95);
    const y=Math.max(12,event.clientY-rect.top-35);
    if(movingId)setNodes(current=>current.map(node=>node.id===movingId?{...node,x,y}:node));
    else if(palette.some(item=>item.kind===kind))addNode(kind,x,y);
  };
  const connect=(targetId:string)=>{
    if(!linkSource){setLinkSource(targetId);return;}
    if(linkSource!==targetId&&!connections.some(item=>item.from===linkSource&&item.to===targetId))setConnections(current=>[...current,{from:linkSource,to:targetId}]);
    setLinkSource(null);
  };
  const openTriggerConfig=(node:FlowNode)=>{const type=node.entrySource?.type||'segment';setConfigNodeId(node.id);setSourceType(type);setSourceId(node.entrySource?.id||getEntrySources(type)[0]?.id||'')};
  const saveTriggerConfig=()=>{if(!configNodeId)return;const source=getEntrySources(sourceType).find(item=>item.id===sourceId);if(!source)return;setNodes(current=>current.map(node=>node.id===configNodeId?{...node,entrySource:source}:node));setConfigNodeId(null)};
  const openTaskConfig=(node:FlowNode)=>{const templates=getTaskTemplates();setTaskConfigNodeId(node.id);setTaskTemplateId(node.taskTemplate?.id||templates[0]?.id||'')};
  const saveTaskConfig=()=>{if(!taskConfigNodeId)return;const template=getTaskTemplates().find(item=>item.id===taskTemplateId);if(!template)return;setNodes(current=>current.map(node=>node.id===taskConfigNodeId?{...node,taskTemplate:template}:node));setTaskConfigNodeId(null)};
  const openWaitConfig=(node:FlowNode)=>{setWaitConfigNodeId(node.id);setWaitAmount(node.waitConfig?.amount||1);setWaitUnit(node.waitConfig?.unit||'days')};
  const saveWaitConfig=()=>{if(!waitConfigNodeId||waitAmount<1)return;setNodes(current=>current.map(node=>node.id===waitConfigNodeId?{...node,waitConfig:{amount:waitAmount,unit:waitUnit}}:node));setWaitConfigNodeId(null)};
  const openTagConfig=(node:FlowNode)=>{const tags=getAllLeadTags();setTagConfigNodeId(node.id);setSelectedTag(node.tagName||tags[0]||'')};
  const saveTagConfig=()=>{if(!tagConfigNodeId||!selectedTag)return;setNodes(current=>current.map(node=>node.id===tagConfigNodeId?{...node,tagName:selectedTag}:node));setTagConfigNodeId(null)};
  const removeNode=(id:string)=>{
    setNodes(current=>current.filter(node=>node.id!==id));
    setConnections(current=>current.filter(connection=>connection.from!==id&&connection.to!==id));
    if(linkSource===id)setLinkSource(null);
  };
  const resetEditor=()=>{setEditing(false);setEditingId(null);setName('');setNodes([]);setConnections([]);setLinkSource(null)};
  const startNew=()=>{resetEditor();setEditing(true)};
  const editAutomation=async(automation:Automation)=>{setError('');setBusy(true);try{let hydrated=automation;if(remote){const rule=await remoteRpc<{name:string;revisions:Array<{graph:AutomationGraphV1}>}>('core_automation_read',{p_workspace:getRemoteWorkspaceId(),p_rule_id:automation.id});const graph=rule.revisions?.[0]?.graph;if(!graph)throw Error('A automação ainda não possui uma revisão editável.');const ui=automationGraphToUi(graph);hydrated={...automation,name:rule.name,nodes:ui.nodes,connections:ui.connections}}setEditingId(hydrated.id);setName(hydrated.name);setNodes(hydrated.nodes);setConnections(hydrated.connections);setLinkSource(null);setEditing(true)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
  const confirmDelete=async()=>{if(!deleteTarget)return;setError('');setBusy(true);try{if(remote){await remoteRpc('core_automation_pause',{p_workspace:getRemoteWorkspaceId(),p_rule_id:deleteTarget.id});setAutomations(current=>current.map(item=>item.id===deleteTarget.id?{...item,enabled:false}:item))}else{const updated=automations.filter(item=>item.id!==deleteTarget.id);setAutomations(updated);localStorage.setItem('marketing_core_automations',JSON.stringify(updated))}setDeleteTarget(null)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
  const reactivate=async(automation:Automation)=>{setError('');setBusy(true);try{let revisionId=automation.activeRevisionId;if(!revisionId){const rule=await remoteRpc<{revisions:Array<{id:string}>}>('core_automation_read',{p_workspace:getRemoteWorkspaceId(),p_rule_id:automation.id});revisionId=rule.revisions?.[0]?.id}if(!revisionId)throw Error('A automação ainda não possui uma revisão publicada para reativar.');await remoteRpc('core_automation_activate',{p_workspace:getRemoteWorkspaceId(),p_rule_id:automation.id,p_revision_id:revisionId});setAutomations(current=>current.map(item=>item.id===automation.id?{...item,enabled:true,activeRevisionId:revisionId}:item))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
  const save=async()=>{
    const trimmedName=name.trim();
    if(!trimmedName||!nodes.length)return;
    const current=editingId?automations.find(item=>item.id===editingId):null;
    const next:Automation={id:current?.id||`automation-${Date.now()}`,name:trimmedName,nodes,connections,createdAt:current?.createdAt||new Date().toLocaleDateString('pt-BR')};
    const updated=editingId?automations.map(item=>item.id===editingId?next:item):[next,...automations];
    setError('');setBusy(true);try{if(remote){const workspace=getRemoteWorkspaceId();const result=await remoteRpc<{rule_id:string;revision_id:string}>('core_automation_publish',{p_workspace:workspace,p_rule_id:editingId||null,p_name:trimmedName,p_graph:automationGraphFromUi(nodes,connections),p_expected_hash:null});await remoteRpc('core_automation_activate',{p_workspace:workspace,p_rule_id:result.rule_id,p_revision_id:result.revision_id});next.id=result.rule_id;next.enabled=true;next.activeRevisionId=result.revision_id;setAutomations(current=>editingId?current.map(item=>item.id===editingId?next:item):[next,...current])}else{setAutomations(editingId?updated:[next,...automations]);localStorage.setItem('marketing_core_automations',JSON.stringify(updated))}resetEditor()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  };
  const lines=useMemo(()=>connections.map(connection=>{
    const from=nodes.find(node=>node.id===connection.from);const to=nodes.find(node=>node.id===connection.to);
    return from&&to?{...connection,x1:from.x+190,y1:from.y+39,x2:to.x,y2:to.y+39}:null;
  }).filter(Boolean) as Array<Connection&{x1:number;y1:number;x2:number;y2:number}>,[connections,nodes]);

  if(editing)return <>
    <PageHeader title={editingId?'Editar automação':'Criar automação'} subtitle="Monte o fluxo arrastando ações, conecte os caminhos e salve." actions={<><button className="btn" onClick={resetEditor}>Cancelar</button><button className="btn primary" disabled={busy||!name.trim()||!nodes.length} onClick={save}>{busy?'Salvando…':editingId?'Salvar alterações':'Salvar automação'}</button></>}/>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="automation-name-bar"><label className="field"><span>NOME DA AUTOMAÇÃO</span><input aria-label="Nome da automação" autoFocus placeholder="Ex.: Nutrição de novos leads" value={name} onChange={event=>setName(event.target.value)}/></label><span>{nodes.length} etapas · {connections.length} conexões</span></div>
    <div className="automation-builder">
      <div className="automation-canvas" ref={canvasRef} onDragOver={event=>event.preventDefault()} onDrop={dropOnCanvas}>
        {!nodes.length&&<div className="canvas-hint"><Play size={25}/><strong>Arraste uma ação para começar</strong><span>Você também pode clicar nos cards à direita.</span></div>}
        <svg className="automation-lines" aria-hidden="true">{lines.map(line=><path key={`${line.from}-${line.to}`} d={`M ${line.x1} ${line.y1} C ${line.x1+70} ${line.y1}, ${line.x2-70} ${line.y2}, ${line.x2} ${line.y2}`}/>)}</svg>
        {nodes.map(node=>{const item=palette.find(entry=>entry.kind===node.kind)!;const Icon=item.Icon;return <article data-testid="automation-node" className={`automation-node ${linkSource===node.id?'is-linking':''}`} style={{left:node.x,top:node.y}} draggable onDragStart={event=>event.dataTransfer.setData('automation-node',node.id)} key={node.id}>
          <div className="automation-node-head"><span><Icon size={16}/></span><strong>{node.label}</strong><button aria-label={`Excluir ${node.label}`} onClick={()=>removeNode(node.id)}><Trash2 size={14}/></button></div>
          {node.kind==='trigger'&&<button className={`node-source-config ${node.entrySource?'configured':''}`} aria-label="Configurar origem dos leads" onClick={()=>openTriggerConfig(node)}><Settings2 size={13}/><span>{node.entrySource?node.entrySource.label:'Configurar origem dos leads'}</span></button>}
          {node.kind==='task'&&<button className={`node-source-config ${node.taskTemplate?'configured':''}`} aria-label="Configurar tarefa da automação" onClick={()=>openTaskConfig(node)}><Settings2 size={13}/><span>{node.taskTemplate?node.taskTemplate.title:'Selecionar tarefa'}</span></button>}
          {node.kind==='wait'&&<button className={`node-source-config ${node.waitConfig?'configured':''}`} aria-label="Configurar período de espera" onClick={()=>openWaitConfig(node)}><Settings2 size={13}/><span>{node.waitConfig?formatWait(node.waitConfig):'Configurar período de espera'}</span></button>}
          {node.kind==='tag'&&<button className={`node-source-config ${node.tagName?'configured':''}`} aria-label="Configurar tag da automação" onClick={()=>openTagConfig(node)}><Settings2 size={13}/><span>{node.tagName||'Selecionar tag'}</span></button>}
          <button className="node-connect" onClick={()=>connect(node.id)}>{linkSource&&linkSource!==node.id?'Conectar aqui':linkSource===node.id?'Selecione o destino':'Conectar etapa'}</button>
        </article>})}
      </div>
      <aside className="automation-palette"><header><strong>Ações da automação</strong><span>Clique ou arraste para o fluxo</span></header>{palette.map(({kind,label,description,Icon})=>{const unsupported=remote&&!['trigger','task'].includes(kind);return <button aria-label={`Adicionar ${label}`} className="automation-action-card" disabled={unsupported} title={unsupported?'Ação ainda não suportada pelo motor remoto.':''} draggable={!unsupported} onDragStart={event=>event.dataTransfer.setData('automation-action',kind)} onClick={()=>addNode(kind)} key={kind}><span className="action-icon"><Icon size={18}/></span><span><strong>{label}</strong><small>{unsupported?'Indisponível no motor remoto':description}</small></span></button>})}</aside>
    </div>
    {configNodeId&&<div className="modal-backdrop automation-source-backdrop" role="presentation"><section className="automation-source-modal" role="dialog" aria-modal="true" aria-label="Configurar origem dos leads"><header><div><span>ENTRADA DO FLUXO</span><h2>De onde virão os leads?</h2><p>Escolha qual evento de entrada deve iniciar esta automação.</p></div><button aria-label="Fechar configuração da origem" onClick={()=>setConfigNodeId(null)}>×</button></header><div className="automation-source-body"><label className="field"><span>TIPO DE ENTRADA</span><select aria-label="Tipo de origem dos leads" value={sourceType} onChange={event=>{const type=event.target.value as EntrySourceType;setSourceType(type);setSourceId(getEntrySources(type)[0]?.id||'')}}>{(Object.entries(sourceTypeLabels) as [EntrySourceType,string][]).map(([type,label])=><option value={type} key={type}>{label}</option>)}</select></label><label className="field"><span>ORIGEM ESPECÍFICA</span><select aria-label="Origem específica dos leads" value={sourceId} onChange={event=>setSourceId(event.target.value)} disabled={!getEntrySources(sourceType).length}><option value="">Selecione</option>{getEntrySources(sourceType).map(source=><option value={source.id} key={source.id}>{source.label}</option>)}</select></label>{sourceType==='segment'&&!getEntrySources(sourceType).length&&<div className="automation-source-empty">Nenhuma lista de segmentação foi criada. Crie uma lista antes de usá-la como entrada.</div>}<div className="automation-source-help"><strong>Como funciona</strong><span>Quando um lead entrar pela origem selecionada, ele será inserido automaticamente neste fluxo.</span></div></div><footer><button className="btn secondary" onClick={()=>setConfigNodeId(null)}>Cancelar</button><button className="btn primary" disabled={!sourceId} onClick={saveTriggerConfig}>Salvar origem</button></footer></section></div>}
    {taskConfigNodeId&&<div className="modal-backdrop automation-source-backdrop" role="presentation"><section className="automation-source-modal" role="dialog" aria-modal="true" aria-label="Configurar tarefa da automação"><header><div><span>AÇÃO DA AUTOMAÇÃO</span><h2>Qual tarefa deve ser criada?</h2><p>Selecione uma tarefa configurada para ser adicionada ao lead quando ele chegar nesta etapa.</p></div><button aria-label="Fechar configuração da tarefa" onClick={()=>setTaskConfigNodeId(null)}>×</button></header><div className="automation-source-body"><label className="field"><span>TAREFA</span><select aria-label="Selecionar tarefa configurada" value={taskTemplateId} onChange={event=>setTaskTemplateId(event.target.value)}><option value="">Selecione</option>{getTaskTemplates().map(template=><option value={template.id} key={template.id}>{template.title}</option>)}</select></label><div className="automation-source-help"><strong>A tarefa será criada automaticamente</strong><span>Quando o lead alcançar este card, a tarefa selecionada será associada ao contato dentro do CRM.</span></div></div><footer><button className="btn secondary" onClick={()=>setTaskConfigNodeId(null)}>Cancelar</button><button className="btn primary" disabled={!taskTemplateId} onClick={saveTaskConfig}>Salvar tarefa</button></footer></section></div>}
    {waitConfigNodeId&&<div className="modal-backdrop automation-source-backdrop" role="presentation"><section className="automation-source-modal" role="dialog" aria-modal="true" aria-label="Configurar período de espera"><header><div><span>INTERVALO DA AUTOMAÇÃO</span><h2>Quanto tempo o fluxo deve aguardar?</h2><p>Defina o intervalo antes de executar a próxima etapa.</p></div><button aria-label="Fechar configuração de espera" onClick={()=>setWaitConfigNodeId(null)}>×</button></header><div className="automation-source-body"><div className="wait-config-grid"><label className="field"><span>QUANTIDADE</span><input aria-label="Quantidade do período" type="number" min="1" value={waitAmount} onChange={event=>setWaitAmount(Number(event.target.value))}/></label><label className="field"><span>UNIDADE</span><select aria-label="Unidade do período" value={waitUnit} onChange={event=>setWaitUnit(event.target.value as WaitConfig['unit'])}><option value="hours">Horas</option><option value="days">Dias</option><option value="weeks">Semanas</option><option value="months">Meses</option></select></label></div><div className="automation-source-help"><strong>Período configurado: {formatWait({amount:waitAmount,unit:waitUnit})}</strong><span>O lead ficará aguardando esse intervalo antes de seguir para o próximo card conectado.</span></div></div><footer><button className="btn secondary" onClick={()=>setWaitConfigNodeId(null)}>Cancelar</button><button className="btn primary" disabled={waitAmount<1} onClick={saveWaitConfig}>Salvar período</button></footer></section></div>}
    {tagConfigNodeId&&<div className="modal-backdrop automation-source-backdrop" role="presentation"><section className="automation-source-modal" role="dialog" aria-modal="true" aria-label="Configurar tag da automação"><header><div><span>CLASSIFICAÇÃO DO LEAD</span><h2>Qual tag deve ser adicionada?</h2><p>Selecione a tag que será aplicada ao lead quando ele alcançar este card.</p></div><button aria-label="Fechar configuração da tag" onClick={()=>setTagConfigNodeId(null)}>×</button></header><div className="automation-source-body"><label className="field"><span>TAG</span><select aria-label="Selecionar tag da automação" value={selectedTag} onChange={event=>setSelectedTag(event.target.value)}><option value="">Selecione</option>{getAllLeadTags().map(tag=><option value={tag} key={tag}>{tag}</option>)}</select></label>{!getAllLeadTags().length&&<div className="automation-source-empty">Nenhuma tag está disponível. Adicione uma tag no perfil de um lead antes de configurar este card.</div>}<div className="automation-source-help"><strong>Aplicação automática</strong><span>A tag selecionada será adicionada ao contato assim que ele passar por esta etapa da automação.</span></div></div><footer><button className="btn secondary" onClick={()=>setTagConfigNodeId(null)}>Cancelar</button><button className="btn primary" disabled={!selectedTag} onClick={saveTagConfig}>Salvar tag</button></footer></section></div>}
  </>;

  return <>
    <PageHeader title="Automações" subtitle="Fluxos comerciais orientados por eventos e ações." actions={<button className="btn primary" onClick={startNew}>+ Nova automação</button>}/>{error&&<p className="form-error" role="alert">{error}</p>}
    {automations.length?<section className="automation-list">{automations.map(item=><article className="entity-card automation-saved-card" key={item.id}><div className="automation-list-icon"><Zap size={19}/></div><div className="automation-saved-main"><div><h3>{item.name}</h3><p>{remote?(item.enabled?'Ativa':'Pausada'):`${item.nodes.length} etapas`}</p></div><div className="automation-card-actions"><button disabled={busy} className="btn secondary" aria-label={`Editar ${item.name}`} onClick={()=>editAutomation(item)}><Pencil size={14}/>Editar</button>{remote&&!item.enabled?<button disabled={busy} className="btn primary" aria-label={`Reativar ${item.name}`} onClick={()=>reactivate(item)}><Play size={14}/>Reativar</button>:<button disabled={busy} className="btn danger" aria-label={`${remote?'Pausar':'Excluir'} ${item.name}`} onClick={()=>setDeleteTarget(item)}><Trash2 size={14}/>{remote?'Pausar':'Excluir'}</button>}</div></div><div className="entity-foot"><span>{item.connections.length} conexões</span><small>Criada em {item.createdAt}</small></div></article>)}</section>:<section className="surface automation-editor"><EmptyState title="Nenhuma automação criada" body="Clique em Nova automação para montar seu primeiro fluxo comercial."/></section>}
    {deleteTarget&&<div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setDeleteTarget(null)}}><section className="automation-delete-modal" role="dialog" aria-modal="true" aria-label={remote?'Pausar automação':'Excluir automação'}><div className="automation-delete-icon"><Trash2 size={22}/></div><h2>{remote?'Pausar automação?':'Excluir automação?'}</h2><p>{remote?<>A automação <strong>{deleteTarget.name}</strong> será desativada e poderá ser editada ou reativada depois.</>:<>A automação <strong>{deleteTarget.name}</strong> e todo o fluxo configurado serão removidos. Esta ação não pode ser desfeita.</>}</p><footer><button className="btn secondary" onClick={()=>setDeleteTarget(null)}>Cancelar</button><button disabled={busy} className="btn danger" onClick={confirmDelete}>{busy?'Processando…':remote?'Confirmar pausa':'Confirmar exclusão'}</button></footer></section></div>}
  </>;
}
