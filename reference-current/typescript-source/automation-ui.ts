import { validateAutomationGraph, type AutomationGraphV1 } from './automation-safe.js';

export interface AutomationSummary { id:string; name:string; enabled:boolean; active_revision_id:string|null; updated_at:string }
export interface AutomationDocument extends AutomationSummary { revisions:Array<{id:string;revision:number;graph_hash:string;graph:unknown;published_at:string}> }
export interface AutomationGateway {
  list(workspaceId:string):Promise<AutomationSummary[]>;
  read(workspaceId:string,ruleId:string):Promise<AutomationDocument>;
  publish(input:{workspaceId:string;ruleId:string|null;name:string;graph:AutomationGraphV1}):Promise<{rule_id:string;revision_id:string;graph_hash:string}>;
  activate(workspaceId:string,ruleId:string,revisionId:string):Promise<void>;
  pause(workspaceId:string,ruleId:string):Promise<void>;
}
export interface AutomationEditorOptions { root:HTMLElement; workspaceId:string; gateway:AutomationGateway; onError?:(error:unknown)=>void }

const element = <K extends keyof HTMLElementTagNameMap>(tag:K,className?:string,text?:string):HTMLElementTagNameMap[K] => {
  const node=document.createElement(tag); if(className)node.className=className; if(text!==undefined)node.textContent=text; return node;
};
const button=(label:string,action:string):HTMLButtonElement=>{const node=element('button','automation-button',label);node.type='button';node.dataset.action=action;return node;};
const emptyGraph=():AutomationGraphV1=>({schema_version:1,nodes:[
  {id:'trigger',type:'trigger',subtype:'LEAD_CREATED',position:{x:0,y:0},config:{}},
  {id:'action',type:'action',subtype:'CREATE_TASK',position:{x:280,y:0},config:{title:'Fazer primeiro contato',delay:24,unit:'hours'}},
],edges:[{id:'edge-1',source:'trigger',target:'action'}]});

export class AutomationEditorController {
  readonly root:HTMLElement; readonly workspaceId:string; readonly gateway:AutomationGateway;
  private listeners:AbortController|null=null; private current:AutomationDocument|null=null; private graph:AutomationGraphV1=emptyGraph(); private busy=false;
  constructor(private readonly options:AutomationEditorOptions){this.root=options.root;this.workspaceId=options.workspaceId;this.gateway=options.gateway;}
  async mount():Promise<void>{this.destroyListeners();this.listeners=new AbortController();this.root.replaceChildren();this.renderShell();this.bind();await this.refresh();}
  destroy():void{this.destroyListeners();this.root.replaceChildren();this.current=null;}
  private destroyListeners():void{this.listeners?.abort();this.listeners=null;}
  private fail(error:unknown):void{if(this.options.onError)this.options.onError(error);else console.error(error);const status=this.root.querySelector<HTMLElement>('[data-role="status"]');if(status)status.textContent=error instanceof Error?error.message:'Automation error';}
  private renderShell():void{
    const shell=element('section','automation-editor');shell.dataset.component='automation-editor';
    const header=element('header','automation-header');header.append(element('h2','automation-title','Automações'),button('Nova','new'));
    const status=element('p','automation-status');status.dataset.role='status';status.setAttribute('aria-live','polite');
    const body=element('div','automation-layout');const list=element('div','automation-list');list.dataset.role='list';
    const editor=element('form','automation-form');editor.dataset.role='editor';
    const nameLabel=element('label','automation-label','Nome');const name=element('input','automation-name');name.name='name';name.required=true;name.maxLength=200;nameLabel.append(name);
    const graphLabel=element('label','automation-label','Grafo JSON');const graph=element('textarea','automation-graph');graph.name='graph';graph.required=true;graph.rows=18;graph.spellcheck=false;graphLabel.append(graph);
    const controls=element('div','automation-controls');controls.append(button('Publicar','publish'),button('Ativar','activate'),button('Pausar','pause'));
    editor.append(nameLabel,graphLabel,controls);body.append(list,editor);shell.append(header,status,body);this.root.append(shell);
  }
  private bind():void{
    const signal=this.listeners?.signal;if(!signal)return;
    this.root.addEventListener('click',(event)=>{const target=(event.target as Element|null)?.closest<HTMLButtonElement>('button[data-action]');if(!target||!this.root.contains(target))return;event.preventDefault();void this.act(target.dataset.action||'',target.dataset.id||'');},{signal});
    this.root.addEventListener('submit',(event)=>event.preventDefault(),{signal});
  }
  private async act(action:string,id:string):Promise<void>{
    if(this.busy)return;this.busy=true;
    try{
      if(action==='new'){this.current=null;this.graph=emptyGraph();this.renderEditor();return;}
      if(action==='open'){this.current=await this.gateway.read(this.workspaceId,id);const latest=this.current.revisions[0];this.graph=validateAutomationGraph(latest?.graph??emptyGraph());this.renderEditor();return;}
      const name=this.root.querySelector<HTMLInputElement>('input[name="name"]');const graphField=this.root.querySelector<HTMLTextAreaElement>('textarea[name="graph"]');
      if(!name||!graphField)throw new Error('Editor unavailable');
      if(action==='publish'){
        const parsed:unknown=JSON.parse(graphField.value);this.graph=validateAutomationGraph(parsed);
        const published=await this.gateway.publish({workspaceId:this.workspaceId,ruleId:this.current?.id??null,name:name.value.trim(),graph:this.graph});
        this.current=await this.gateway.read(this.workspaceId,published.rule_id);await this.refresh(published.rule_id);this.message('Revisão publicada.');return;
      }
      if(!this.current)throw new Error('Publique a automação antes de alterar o estado.');
      if(action==='activate'){const revision=this.current.revisions[0];if(!revision)throw new Error('Nenhuma revisão publicada.');await this.gateway.activate(this.workspaceId,this.current.id,revision.id);}
      else if(action==='pause')await this.gateway.pause(this.workspaceId,this.current.id);else return;
      this.current=await this.gateway.read(this.workspaceId,this.current.id);await this.refresh(this.current.id);this.message(action==='activate'?'Automação ativada.':'Automação pausada.');
    }catch(error){this.fail(error);}finally{this.busy=false;}
  }
  private message(value:string):void{const status=this.root.querySelector<HTMLElement>('[data-role="status"]');if(status)status.textContent=value;}
  private async refresh(selectedId?:string):Promise<void>{
    const rows=await this.gateway.list(this.workspaceId);const list=this.root.querySelector<HTMLElement>('[data-role="list"]');if(!list)return;list.replaceChildren();
    if(!rows.length)list.append(element('p','automation-empty','Nenhuma automação publicada.'));
    for(const row of rows){const item=element('article','automation-list-item');const title=element('strong','automation-list-name',row.name);const state=element('span','automation-list-state',row.enabled?'Ativa':'Pausada');const open=button('Editar','open');open.dataset.id=row.id;item.append(title,state,open);list.append(item);}
    if(selectedId){this.current=await this.gateway.read(this.workspaceId,selectedId);const latest=this.current.revisions[0];this.graph=validateAutomationGraph(latest?.graph??emptyGraph());}
    this.renderEditor();
  }
  private renderEditor():void{
    const name=this.root.querySelector<HTMLInputElement>('input[name="name"]');const graph=this.root.querySelector<HTMLTextAreaElement>('textarea[name="graph"]');if(!name||!graph)return;
    name.value=this.current?.name??'';graph.value=JSON.stringify(this.graph,null,2);
    const activate=this.root.querySelector<HTMLButtonElement>('button[data-action="activate"]');const pause=this.root.querySelector<HTMLButtonElement>('button[data-action="pause"]');
    if(activate)activate.disabled=!this.current;if(pause)pause.disabled=!this.current;
  }
}

export function createAutomationEditor(options:AutomationEditorOptions):AutomationEditorController{return new AutomationEditorController(options);}
