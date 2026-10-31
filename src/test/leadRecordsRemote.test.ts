import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {MockLead} from '../data/mockCrmData';

const remote=vi.hoisted(()=>({
 snapshot:null as any,
 update:vi.fn(),
 insert:vi.fn(),
 deleteWhere:vi.fn(),
 deleteRecord:vi.fn(),
 refresh:vi.fn()
}));

vi.mock('../lib/remoteCrm',()=>({
 getRemoteSnapshot:()=>remote.snapshot,
 isRemoteMode:()=>true,
 remoteUpdate:remote.update,
 remoteInsert:remote.insert,
 remoteDeleteWhere:remote.deleteWhere,
 remoteDelete:remote.deleteRecord,
 refreshRemoteCrm:remote.refresh
}));

import {deleteLeadRecord,getEffectiveLeads,importLeadRecords,saveLeadRecord} from '../lib/leadRecords';
import {saveLeadTags} from '../lib/leadTags';

const lead:MockLead={id:'contact-1',name:'Contato',email:'contato@example.com',phone:'31999999999',company:'Empresa',source:'Indicação',status:'Qualificado',createdAt:'01/10/2026'};

beforeEach(()=>{
 remote.snapshot={
  contacts:[{id:'contact-1',workspace_id:'workspace-1',name:'Contato',email:'contato@example.com',phone:'31999999999',company:'Empresa',source:'Site',campaign:'chat-captacao',source_url:'https://marketingcore.com.br/',consent:true,consent_at:'2026-10-01T00:00:00Z',utm:{source:'newsletter'},status:'qualified',notes:null,custom_fields:null,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}],
  tags:[{id:'tag-1',workspace_id:'workspace-1',name:'VIP',color:'#000'},{id:'tag-2',workspace_id:'workspace-1',name:'Quente',color:'#f00'}],
  contactTags:[{workspace_id:'workspace-1',contact_id:'contact-1',tag_id:'tag-1'}]
 };
 remote.update.mockReset().mockResolvedValue({});
 remote.insert.mockReset().mockResolvedValue({});
 remote.deleteWhere.mockReset().mockResolvedValue(undefined);
 remote.deleteRecord.mockReset().mockResolvedValue(undefined);
 remote.refresh.mockReset().mockResolvedValue(remote.snapshot);
});

describe('authenticated lead persistence',()=>{
 it('maps campaign, consent and attribution from the remote contact',()=>{
  expect(getEffectiveLeads()[0]).toMatchObject({campaign:'chat-captacao',source:'Site',sourceUrl:'https://marketingcore.com.br/',consent:true,consentAt:'2026-10-01T00:00:00Z',utm:{source:'newsletter'}});
 });

 it('awaits contact edits and notes, then refreshes',async()=>{
  await saveLeadRecord({lead:{...lead,name:'Contato Atualizado'},tags:['VIP'],notes:[{id:'note-1',text:'Retornar amanhã',createdAt:'agora'}]});
  expect(remote.update).toHaveBeenCalledWith('core_contacts','contact-1',expect.objectContaining({name:'Contato Atualizado',notes:'Retornar amanhã'}),false);
  expect(remote.refresh).toHaveBeenCalledTimes(1);
 });

 it('exposes update errors to the caller and does not refresh',async()=>{
  remote.update.mockRejectedValueOnce(new Error('RLS negou atualização'));
  await expect(saveLeadRecord({lead,tags:['VIP'],notes:[]})).rejects.toThrow('RLS negou atualização');
  expect(remote.refresh).not.toHaveBeenCalled();
 });

 it('persists tag assignments using only existing core_tags',async()=>{
  await saveLeadRecord({lead,tags:['Quente'],notes:[]});
  expect(remote.deleteWhere).toHaveBeenCalledWith('core_contact_tags',{contact_id:'contact-1',tag_id:'tag-1'},false);
  expect(remote.insert).toHaveBeenCalledWith('core_contact_tags',{contact_id:'contact-1',tag_id:'tag-2'},false);
  await expect(saveLeadRecord({lead,tags:['Tag inexistente'],notes:[]})).rejects.toThrow('Tag inexistente');
  remote.refresh.mockClear();remote.update.mockClear();remote.insert.mockClear();remote.deleteRecord.mockClear();
  const pending=new Promise(resolve=>setTimeout(()=>resolve({}),0));remote.update.mockReturnValueOnce(pending);
  await saveLeadTags([{id:'tag-1',name:'VIP atualizado',color:'#111'},{id:'tag-new',name:'Nova',color:'#222'}]);
  expect(remote.update).toHaveBeenCalledWith('core_tags','tag-1',{name:'VIP atualizado',color:'#111'},false);
  expect(remote.insert).toHaveBeenCalledWith('core_tags',{name:'Nova',color:'#222'},false);
  expect(remote.deleteRecord).toHaveBeenCalledWith('core_tags','tag-2',false);
  expect(remote.refresh).toHaveBeenCalledTimes(1);
 });

 it('awaits deletion and exposes provider errors',async()=>{
  remote.deleteRecord.mockRejectedValueOnce(new Error('RLS negou exclusão'));
  await expect(deleteLeadRecord('contact-1')).rejects.toThrow('RLS negou exclusão');
 });

 it('imports every accepted lead remotely, reports progress and refreshes once',async()=>{
  const progress=vi.fn();
  remote.insert
   .mockResolvedValueOnce({...remote.snapshot.contacts[0],id:'created-1',name:'Primeiro'})
   .mockResolvedValueOnce({...remote.snapshot.contacts[0],id:'created-2',name:'Segundo'});
  await importLeadRecords([{...lead,id:'local-1',name:'Primeiro',phone:'31111111111',email:'primeiro@example.com'},{...lead,id:'local-2',name:'Segundo',phone:'31222222222',email:'segundo@example.com'}],progress,{fileName:'leads.csv',sourceType:'CSV',totalRows:2});
  expect(remote.insert).toHaveBeenNthCalledWith(1,'core_contacts',expect.objectContaining({name:'Primeiro'}),false);
  expect(remote.insert).toHaveBeenNthCalledWith(2,'core_contacts',expect.objectContaining({name:'Segundo'}),false);
  expect(remote.insert).toHaveBeenNthCalledWith(3,'core_lead_import_history',expect.objectContaining({file_name:'leads.csv',source_type:'CSV',total_rows:2,imported_rows:2,failed_rows:0,status:'COMPLETED'}),false);
  expect(progress).toHaveBeenLastCalledWith(2,2);
  expect(remote.refresh).toHaveBeenCalledTimes(1);
 });
});
