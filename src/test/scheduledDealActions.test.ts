import {beforeEach,describe,expect,it,vi} from 'vitest';

const remote=vi.hoisted(()=>({
  isRemoteMode:vi.fn(()=>true),
  getRemoteSnapshot:vi.fn(()=>({
    contacts:[{id:'contact-1',name:'Lead Remoto',company:'Empresa Remota'}],
    deals:[{id:'deal-1',name:'Negociação Remota',contact_id:'contact-1',expected_close:'2099-12-01',notes:'Enviar proposta'}],
  })),
  remoteUpdate:vi.fn().mockResolvedValue({}),
}));
vi.mock('../lib/remoteCrm',()=>remote);

import {getScheduledDealActions,removeScheduledDealAction,saveScheduledDealAction} from '../lib/scheduledDealActions';

describe('authenticated scheduled deal actions',()=>{
  beforeEach(()=>{localStorage.clear();remote.remoteUpdate.mockClear()});

  it('reads and writes the existing core_deals contract instead of localStorage',async()=>{
    expect(getScheduledDealActions()).toEqual([{dealId:'deal-1',dealName:'Negociação Remota',leadId:'contact-1',leadName:'Lead Remoto',company:'Empresa Remota',action:'Enviar proposta',date:'2099-12-01'}]);
    await saveScheduledDealAction({dealId:'deal-1',dealName:'Negociação Remota',leadId:'contact-1',leadName:'Lead Remoto',company:'Empresa Remota',action:'Reunião final',date:'2099-12-02'});
    expect(remote.remoteUpdate).toHaveBeenCalledWith('core_deals','deal-1',{expected_close:'2099-12-02',notes:'Reunião final'});
    expect(localStorage.getItem('marketing_core_scheduled_deal_actions')).toBeNull();
    await removeScheduledDealAction('deal-1');
    expect(remote.remoteUpdate).toHaveBeenLastCalledWith('core_deals','deal-1',{expected_close:null,notes:null});
  });
});
