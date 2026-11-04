import {describe,expect,it,vi} from 'vitest';
import {resolveAutomationContact} from '../../supabase/functions/core-automation-worker/contact';

describe('resolveAutomationContact',()=>{
 it('uses ingestion_event_id from outbox context when aggregate_id is the contact id',async()=>{
  const getContact=vi.fn(async(_workspace:string,id:string)=>id==='contact-1'?{id:'contact-1',name:'Synthetic lead'}:null);
  const getDeal=vi.fn(async()=>null);
  const getIngestionEvent=vi.fn(async(_workspace:string,id:string)=>id==='ingestion-1'?{id:'ingestion-1',contact_id:'contact-1',form_id:'form-1'}:null);
  const contact=await resolveAutomationContact({workspace_id:'workspace-1',aggregate_type:'ingestion_event',aggregate_id:'contact-1',context:{ingestion_event_id:'ingestion-1'}},{getContact,getDeal,getIngestionEvent});
  expect(getIngestionEvent).toHaveBeenCalledWith('workspace-1','ingestion-1');
  expect(contact).toEqual({id:'contact-1',name:'Synthetic lead',form_id:'form-1'});
 });

 it('keeps direct contact events unchanged',async()=>{
  const contactRow={id:'contact-2',name:'Another synthetic lead'};
  const getContact=vi.fn(async()=>contactRow);
  const getDeal=vi.fn(async()=>null);
  const getIngestionEvent=vi.fn(async()=>null);
  const contact=await resolveAutomationContact({workspace_id:'workspace-1',aggregate_type:'contact',aggregate_id:'contact-2'},{getContact,getDeal,getIngestionEvent});
  expect(contact).toEqual(contactRow);
  expect(getDeal).not.toHaveBeenCalled();
  expect(getIngestionEvent).not.toHaveBeenCalled();
 });

 it('supports legacy ingestion events whose aggregate_id is the ingestion row id',async()=>{
  const getContact=vi.fn(async(_workspace:string,id:string)=>id==='contact-3'?{id:'contact-3',name:'Legacy synthetic lead'}:null);
  const getDeal=vi.fn(async()=>null);
  const getIngestionEvent=vi.fn(async(_workspace:string,id:string)=>id==='ingestion-legacy'?{id:'ingestion-legacy',contact_id:'contact-3',form_id:'form-legacy'}:null);
  const contact=await resolveAutomationContact({workspace_id:'workspace-1',aggregate_type:'ingestion_event',aggregate_id:'ingestion-legacy',context:{}},{getContact,getDeal,getIngestionEvent});
  expect(contact).toEqual({id:'contact-3',name:'Legacy synthetic lead',form_id:'form-legacy'});
 });

 it('falls back to the aggregate contact when the context ingestion reference is stale',async()=>{
  const contactRow={id:'contact-fallback',name:'Fallback synthetic lead'};
  const getContact=vi.fn(async(_workspace:string,id:string)=>id==='contact-fallback'?contactRow:null);
  const getDeal=vi.fn(async()=>null);
  const getIngestionEvent=vi.fn(async()=>null);
  const contact=await resolveAutomationContact({workspace_id:'workspace-1',aggregate_type:'ingestion_event',aggregate_id:'contact-fallback',context:{ingestion_event_id:'stale-ingestion'}},{getContact,getDeal,getIngestionEvent});
  expect(getIngestionEvent).toHaveBeenCalledWith('workspace-1','stale-ingestion');
  expect(getContact).toHaveBeenCalledWith('workspace-1','contact-fallback');
  expect(contact).toEqual(contactRow);
 });
});
