export type UiActionKind='trigger'|'email'|'whatsapp'|'task'|'wait'|'stage'|'tag'|'deal'|'condition';
export type UiEntrySourceType='segment'|'wordpress'|'webhook'|'facebook'|'api'|'manual';
export type UiConditionSubtype='SOURCE_EQUALS'|'CAMPAIGN_EQUALS'|'STAGE_EQUALS';
export type UiDealDistribution={userId:string;label:string;percentage:number};
export type UiFlowNode={id:string;kind:UiActionKind;label:string;x:number;y:number;entrySource?:{type:UiEntrySourceType;id:string;label:string};taskTemplate?:{id:string;title:string};emailConfig?:{subject:string;body:string};whatsappConfig?:{message:string};waitConfig?:{delay:number;unit:'minutes'|'hours'|'days'};stageConfig?:{stageId:string;stageName:string};tagName?:string;dealConfig?:{assigneeId:string;assigneeLabel:string;assigneeType?:'user'|'team';distribution?:UiDealDistribution[];pipelineId:string;pipelineName:string;stageId:string;stageName:string};conditionConfig?:{subtype:UiConditionSubtype;value?:string;stageId?:string;stageName?:string}};
export type UiConnection={from:string;to:string};
export type GraphV1Node={id:string;type:'trigger'|'condition'|'action';subtype:string;position:{x:number;y:number};config:Record<string,unknown>};
export type AutomationGraphV1={schema_version:'1';nodes:GraphV1Node[];edges:Array<{id:string;source:string;target:string}>};

const nodeContract=(node:UiFlowNode):Pick<GraphV1Node,'type'|'subtype'>=>{
 if(node.kind==='trigger')return {type:'trigger',subtype:node.entrySource?.type==='webhook'?'WEBHOOK_RECEIVED':'LEAD_CREATED'};
 if(node.kind==='task')return {type:'action',subtype:'CREATE_TASK'};
 if(node.kind==='email')return {type:'action',subtype:'SEND_EMAIL'};
 if(node.kind==='whatsapp')return {type:'action',subtype:'SEND_WHATSAPP'};
 if(node.kind==='wait')return {type:'action',subtype:'WAIT'};
 if(node.kind==='stage')return {type:'action',subtype:'MOVE_STAGE'};
 if(node.kind==='tag')return {type:'action',subtype:'ADD_TAG'};
 if(node.kind==='deal')return {type:'action',subtype:'CREATE_DEAL'};
 if(node.kind==='condition'&&node.conditionConfig)return {type:'condition',subtype:node.conditionConfig.subtype};
 throw Error(`A ação “${node.label}” ainda não possui semântica compatível com o motor remoto.`);
};

export function automationGraphFromUi(nodes:UiFlowNode[],connections:UiConnection[]):AutomationGraphV1{
 return {schema_version:'1',nodes:nodes.map(node=>{
  const contract=nodeContract(node);
  const config:Record<string,unknown>={};
  if(node.entrySource)Object.assign(config,{source_type:node.entrySource.type,source_id:node.entrySource.id});
  if(node.taskTemplate)config.title=node.taskTemplate.title;
  if(node.emailConfig)Object.assign(config,node.emailConfig);
  if(node.whatsappConfig)Object.assign(config,node.whatsappConfig);
  if(node.waitConfig)Object.assign(config,node.waitConfig);
  if(node.stageConfig)config.stage_id=node.stageConfig.stageId;
  if(node.tagName)config.tag_name=node.tagName;
  if(node.dealConfig){if(node.dealConfig.assigneeType==='team')Object.assign(config,{team_id:node.dealConfig.assigneeId,distribution:(node.dealConfig.distribution||[]).map(item=>({user_id:item.userId,percentage:item.percentage}))});else config.owner_id=node.dealConfig.assigneeId;Object.assign(config,{pipeline_id:node.dealConfig.pipelineId,stage_id:node.dealConfig.stageId})}
  if(node.conditionConfig){if(node.conditionConfig.subtype==='STAGE_EQUALS')config.stage_id=node.conditionConfig.stageId;else config.value=node.conditionConfig.value;}
  return {id:node.id,...contract,position:{x:node.x,y:node.y},config};
 }),edges:connections.map((edge,index)=>({id:`edge-${index+1}`,source:edge.from,target:edge.to}))};
}

export function automationGraphToUi(graph:AutomationGraphV1):{nodes:UiFlowNode[];connections:UiConnection[]}{
 const nodes=graph.nodes.map(node=>{
  const config=node.config||{};
  const subtypeKinds:Record<string,UiActionKind>={CREATE_TASK:'task',SEND_EMAIL:'email',SEND_WHATSAPP:'whatsapp',WAIT:'wait',MOVE_STAGE:'stage',ADD_TAG:'tag',CREATE_DEAL:'deal'};
  const kind:UiActionKind=node.type==='trigger'?'trigger':node.type==='condition'?'condition':subtypeKinds[node.subtype]||'email';
  const labels:Record<UiActionKind,string>={trigger:'Lead entra no fluxo',email:'Enviar e-mail',whatsapp:'Enviar WhatsApp',task:'Criar tarefa',wait:'Aguardar',stage:'Mover etapa',tag:'Adicionar tag',deal:'Criar negociação',condition:'Condição'};
  const result:UiFlowNode={id:node.id,kind,label:typeof config.ui_label==='string'?config.ui_label:labels[kind],x:node.position.x,y:node.position.y};
  if(typeof config.source_type==='string'&&typeof config.source_id==='string')result.entrySource={type:config.source_type as UiEntrySourceType,id:config.source_id,label:typeof config.source_label==='string'?config.source_label:config.source_id};
  if(typeof config.title==='string')result.taskTemplate={id:typeof config.template_id==='string'?config.template_id:config.title,title:config.title};
  else if(typeof config.template_id==='string'&&typeof config.template_title==='string')result.taskTemplate={id:config.template_id,title:config.template_title};
  if(typeof config.subject==='string'&&typeof config.body==='string')result.emailConfig={subject:config.subject,body:config.body};
  if(typeof config.message==='string')result.whatsappConfig={message:config.message};
  if(typeof config.delay==='number'&&typeof config.unit==='string')result.waitConfig={delay:config.delay,unit:config.unit as 'minutes'|'hours'|'days'};
  if(kind==='stage'&&typeof config.stage_id==='string')result.stageConfig={stageId:config.stage_id,stageName:''};
  if(typeof config.tag_name==='string')result.tagName=config.tag_name;
  if(kind==='deal'&&(typeof config.owner_id==='string'||typeof config.team_id==='string')){const team=typeof config.team_id==='string';const distribution=Array.isArray(config.distribution)?config.distribution.flatMap(item=>{if(!item||typeof item!=='object')return[];const row=item as Record<string,unknown>;return typeof row.user_id==='string'&&typeof row.percentage==='number'?[{userId:row.user_id,label:'',percentage:row.percentage}]:[]}):undefined;result.dealConfig={assigneeId:String(team?config.team_id:config.owner_id),assigneeLabel:'',assigneeType:team?'team':'user',distribution,pipelineId:typeof config.pipeline_id==='string'?config.pipeline_id:'',pipelineName:'',stageId:typeof config.stage_id==='string'?config.stage_id:'',stageName:''}}
  if(node.type==='condition'){result.conditionConfig={subtype:node.subtype as UiConditionSubtype};if(node.subtype==='STAGE_EQUALS'&&typeof config.stage_id==='string')result.conditionConfig.stageId=config.stage_id;else if(typeof config.value==='string')result.conditionConfig.value=config.value;}
  return result;
 });
 return {nodes,connections:graph.edges.map(edge=>({from:edge.source,to:edge.target}))};
}
