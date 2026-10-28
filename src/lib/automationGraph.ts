export type UiActionKind='trigger'|'email'|'whatsapp'|'task'|'wait'|'stage'|'tag'|'condition';
export type UiEntrySourceType='segment'|'wordpress'|'webhook'|'facebook'|'api'|'manual';
export type UiFlowNode={id:string;kind:UiActionKind;label:string;x:number;y:number;entrySource?:{type:UiEntrySourceType;id:string;label:string};taskTemplate?:{id:string;title:string};waitConfig?:{amount:number;unit:'hours'|'days'|'weeks'|'months'};tagName?:string};
export type UiConnection={from:string;to:string};
export type GraphV1Node={id:string;type:'trigger'|'condition'|'action';subtype:string;position:{x:number;y:number};config:Record<string,unknown>};
export type AutomationGraphV1={schema_version:'1';nodes:GraphV1Node[];edges:Array<{id:string;source:string;target:string}>};

const nodeContract=(node:UiFlowNode):Pick<GraphV1Node,'type'|'subtype'>=>{
 if(node.kind==='trigger')return {type:'trigger',subtype:node.entrySource?.type==='webhook'?'WEBHOOK_RECEIVED':'LEAD_CREATED'};
 if(node.kind==='task')return {type:'action',subtype:'CREATE_TASK'};
 throw Error(`A ação “${node.label}” ainda não possui semântica compatível com o motor remoto.`);
};

export function automationGraphFromUi(nodes:UiFlowNode[],connections:UiConnection[]):AutomationGraphV1{
 return {schema_version:'1',nodes:nodes.map(node=>{
  const contract=nodeContract(node);
  const config:Record<string,unknown>={};
  if(node.entrySource)Object.assign(config,{source_type:node.entrySource.type,source_id:node.entrySource.id,source_label:node.entrySource.label});
  if(node.taskTemplate)Object.assign(config,{template_id:node.taskTemplate.id,template_title:node.taskTemplate.title});
  if(node.waitConfig)Object.assign(config,{wait_amount:node.waitConfig.amount,wait_unit:node.waitConfig.unit});
  if(node.tagName)config.tag_name=node.tagName;
  if(!node.entrySource&&!node.taskTemplate&&!node.waitConfig&&!node.tagName&&node.kind!=='trigger'&&node.kind!=='task')Object.assign(config,{ui_kind:node.kind,ui_label:node.label});
  return {id:node.id,...contract,position:{x:node.x,y:node.y},config};
 }),edges:connections.map((edge,index)=>({id:`edge-${index+1}`,source:edge.from,target:edge.to}))};
}

export function automationGraphToUi(graph:AutomationGraphV1):{nodes:UiFlowNode[];connections:UiConnection[]}{
 const nodes=graph.nodes.map(node=>{
  const config=node.config||{};
  const kind:UiActionKind=node.type==='trigger'?'trigger':node.type==='condition'?'condition':node.subtype==='CREATE_TASK'?'task':node.subtype==='CREATE_FOLLOWUP'?'stage':node.subtype==='ADD_TO_SEGMENT_LIST'?'tag':typeof config.ui_kind==='string'?config.ui_kind as UiActionKind:'email';
  const labels:Record<UiActionKind,string>={trigger:'Lead entra no fluxo',email:'Enviar e-mail',whatsapp:'Enviar WhatsApp',task:'Criar tarefa',wait:'Aguardar',stage:'Mover etapa',tag:'Adicionar tag',condition:'Condição'};
  const result:UiFlowNode={id:node.id,kind,label:typeof config.ui_label==='string'?config.ui_label:labels[kind],x:node.position.x,y:node.position.y};
  if(typeof config.source_type==='string'&&typeof config.source_id==='string'&&typeof config.source_label==='string')result.entrySource={type:config.source_type as UiEntrySourceType,id:config.source_id,label:config.source_label};
  if(typeof config.template_id==='string'&&typeof config.template_title==='string')result.taskTemplate={id:config.template_id,title:config.template_title};
  if(typeof config.wait_amount==='number'&&typeof config.wait_unit==='string')result.waitConfig={amount:config.wait_amount,unit:config.wait_unit as UiFlowNode['waitConfig'] extends infer W?W extends {unit:infer U}?U:never:never};
  if(typeof config.tag_name==='string')result.tagName=config.tag_name;
  return result;
 });
 return {nodes,connections:graph.edges.map(edge=>({from:edge.source,to:edge.target}))};
}
