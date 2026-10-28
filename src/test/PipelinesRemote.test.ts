import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocked=vi.hoisted(()=>({
  update:vi.fn(async(..._args:unknown[])=>({})),
  remove:vi.fn(async(..._args:unknown[])=>undefined),
  insert:vi.fn(async(..._args:unknown[])=>({id:'new'})),
  refresh:vi.fn(async()=>({})),
}));

vi.mock('../lib/remoteCrm',()=>({
  getRemoteSnapshot:()=>({
    pipelines:[{id:'pipeline-1',name:'Pipeline comercial'}],
    stages:[
      {id:'stage-1',pipeline_id:'pipeline-1',name:'Novo lead'},
      {id:'stage-2',pipeline_id:'pipeline-1',name:'Contato'},
      {id:'stage-3',pipeline_id:'pipeline-1',name:'Qualificação'},
      {id:'stage-4',pipeline_id:'pipeline-1',name:'Proposta'},
      {id:'stage-5',pipeline_id:'pipeline-1',name:'Negociação'},
    ],
  }),
  isRemoteMode:()=>true,
  remoteUpdate:mocked.update,
  remoteDelete:mocked.remove,
  remoteInsert:mocked.insert,
  refreshRemoteCrm:mocked.refresh,
}));

import {savePipelines} from '../lib/pipelines';

describe('remote pipeline persistence',()=>{
  beforeEach(()=>vi.clearAllMocks());

  it('waits for all stage changes and refreshes the CRM snapshot only once',async()=>{
    await savePipelines([{id:'pipeline-1',name:'Pipeline comercial',stages:[
      {id:'stage-1',name:'Novo lead'},
      {id:'stage-2',name:'Contato'},
      {id:'stage-3',name:'Qualificação'},
    ]}]);

    expect(mocked.update).toHaveBeenCalledTimes(4);
    expect(mocked.remove).toHaveBeenCalledTimes(2);
    expect(mocked.update.mock.calls.every(call=>call[3]===false)).toBe(true);
    expect(mocked.remove.mock.calls.every(call=>call[2]===false)).toBe(true);
    expect(mocked.refresh).toHaveBeenCalledTimes(1);
  });
});
