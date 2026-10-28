import {fireEvent,render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const remote=vi.hoisted(()=>{
  const snapshot={
    workspace:{id:'workspace-1',name:'Workspace',slug:'workspace',state:'active',logo_path:null,created_at:'2026-10-01T00:00:00Z'},
    membership:{workspace_id:'workspace-1',user_id:'user-1',role:'owner',active:true,joined_at:'2026-10-01T00:00:00Z'},
    contacts:[{id:'contact-1',workspace_id:'workspace-1',name:'Contato remoto',email:'remote@example.com',phone:'31999999999',company:'Empresa remota',source:'Indicação',status:'qualified',notes:null,custom_fields:{},created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}],
    pipelines:[{id:'pipeline-1',workspace_id:'workspace-1',name:'Pipeline comercial',is_default:true,created_at:'2026-10-01T00:00:00Z'}],
    stages:[
      {id:'stage-open',workspace_id:'workspace-1',pipeline_id:'pipeline-1',name:'Qualificação',position:0,probability:20,outcome:'open'},
      {id:'stage-won',workspace_id:'workspace-1',pipeline_id:'pipeline-1',name:'Fechado com sucesso',position:1,probability:100,outcome:'won'},
    ],
    deals:[{id:'deal-1',workspace_id:'workspace-1',contact_id:'contact-1',pipeline_id:'pipeline-1',stage_id:'stage-open',name:'Venda remota',value:'15000',status:'open',owner_id:'user-1',expected_close:null,notes:'Ligação',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}],
    tasks:[],tags:[],contactTags:[],notifications:[],members:[],campaigns:[],segmentLists:[],segmentMembers:[],automations:[],summary:null,
  };
  return {snapshot,update:vi.fn(),insert:vi.fn(),remove:vi.fn()};
});

vi.mock('../lib/remoteCrm',()=>({
  getRemoteSnapshot:()=>remote.snapshot,
  isRemoteMode:()=>true,
  REMOTE_UPDATED_EVENT:'marketing-core-remote-updated',
  remoteUpdate:remote.update,
  remoteInsert:remote.insert,
  remoteDelete:remote.remove,
}));

import {PipelinePage} from '../pages/PipelinePage';

const deferred=<T,>()=>{let resolve!:(value:T)=>void;let reject!:(reason?:unknown)=>void;const promise=new Promise<T>((ok,no)=>{resolve=ok;reject=no});return{promise,resolve,reject}};

describe('persistência remota das negociações na Pipeline',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('marketing_core_selected_pipeline','pipeline-1');
    remote.snapshot.stages.splice(0,remote.snapshot.stages.length,
      {id:'stage-open',workspace_id:'workspace-1',pipeline_id:'pipeline-1',name:'Qualificação',position:0,probability:20,outcome:'open'},
      {id:'stage-won',workspace_id:'workspace-1',pipeline_id:'pipeline-1',name:'Fechado com sucesso',position:1,probability:100,outcome:'won'},
    );
    Object.assign(remote.snapshot.deals[0],{stage_id:'stage-open',status:'open',notes:'Ligação',expected_close:null,name:'Venda remota'});
  });

  it('aguarda a edição remota e mantém o editor aberto quando a atualização falha',async()=>{
    const pending=deferred<Record<string,unknown>>();
    remote.update.mockReturnValueOnce(pending.promise);
    const user=userEvent.setup();
    render(<PipelinePage/>);
    await user.click(screen.getByTestId('deal-card-deal-1'));
    await user.click(screen.getByRole('button',{name:'Editar negociação'}));
    const name=screen.getByDisplayValue('Venda remota');
    await user.clear(name);
    await user.type(name,'Venda alterada');
    await user.click(screen.getByRole('button',{name:'Salvar alterações'}));
    expect(screen.getByRole('dialog',{name:/Editar negociação/})).toBeInTheDocument();
    pending.reject(new Error('RLS bloqueou a edição'));
    expect(await screen.findByRole('status')).toHaveTextContent('RLS bloqueou a edição');
    expect(screen.getByRole('dialog',{name:/Editar negociação/})).toBeInTheDocument();
  });

  it('marca como ganha usando a etapa remota cujo outcome é won e só confirma após persistir',async()=>{
    const pending=deferred<Record<string,unknown>>();
    remote.update.mockReturnValueOnce(pending.promise);
    const user=userEvent.setup();
    render(<PipelinePage/>);
    await user.click(screen.getByTestId('deal-card-deal-1'));
    await user.click(screen.getByRole('button',{name:'Marcar como ganha'}));
    expect(screen.getByRole('dialog',{name:/Detalhes da negociação/})).toBeInTheDocument();
    expect(remote.update).toHaveBeenCalledWith('core_deals','deal-1',expect.objectContaining({stage_id:'stage-won',status:'won'}));
    pending.resolve({});
    expect(await screen.findByRole('status')).toHaveTextContent('Negociação marcada como ganha');
    expect(screen.queryByRole('dialog',{name:/Detalhes da negociação/})).not.toBeInTheDocument();
  });

  it('persiste perda sem etapa sintética, incluindo motivo e observação nas notas remotas',async()=>{
    remote.update.mockResolvedValueOnce({});
    const user=userEvent.setup();
    render(<PipelinePage/>);
    await user.click(screen.getByTestId('deal-card-deal-1'));
    await user.click(screen.getByRole('button',{name:'Marcar como perdida'}));
    await user.selectOptions(screen.getByLabelText('Motivo da perda'),'Preço/orçamento');
    await user.type(screen.getByLabelText('Observação da perda'),'Cliente adiou o projeto.');
    await user.click(screen.getByRole('button',{name:'Confirmar perda'}));
    expect(remote.update).toHaveBeenCalledWith('core_deals','deal-1',expect.objectContaining({
      stage_id:'stage-open',status:'lost',expected_close:null,
      notes:'Motivo da perda: Preço/orçamento\nObservação: Cliente adiou o projeto.',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Negociação marcada como perdida');
  });

  it('mantém a próxima ação anterior e mostra erro quando a persistência falha',async()=>{
    remote.update.mockRejectedValueOnce(new Error('Não foi possível salvar a ação'));
    const user=userEvent.setup();
    render(<PipelinePage/>);
    await user.click(screen.getByTestId('deal-card-deal-1'));
    const action=screen.getByLabelText('Selecionar próxima ação');
    await user.selectOptions(action,'Enviar contrato');
    expect(await screen.findByRole('status')).toHaveTextContent('Não foi possível salvar a ação');
    expect(action).toHaveValue('Ligação');
  });

  it('aguarda a persistência ao arrastar e exibe a falha sem confirmar a mudança',async()=>{
    remote.snapshot.stages.splice(1,0,{id:'stage-proposal',workspace_id:'workspace-1',pipeline_id:'pipeline-1',name:'Proposta',position:1,probability:60,outcome:'open'});
    remote.update.mockRejectedValueOnce(new Error('Falha de rede'));
    render(<PipelinePage/>);
    const card=screen.getByTestId('deal-card-deal-1');
    const target=screen.getByTestId('pipeline-stage-Proposta');
    fireEvent.dragStart(card);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    expect(await screen.findByRole('status')).toHaveTextContent('Falha de rede');
    expect(within(screen.getByTestId('pipeline-stage-Qualificação')).getByTestId('deal-card-deal-1')).toBeInTheDocument();
  });
});
