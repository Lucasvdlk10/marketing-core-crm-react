export type ContactRow=Record<string,unknown>;
export type AutomationEventRef={workspace_id:string;aggregate_type:string;aggregate_id:string;context?:unknown};
export type ContactResolvers={
 getContact:(workspaceId:string,contactId:string)=>Promise<ContactRow|null>;
 getDeal:(workspaceId:string,dealId:string)=>Promise<ContactRow|null>;
 getIngestionEvent:(workspaceId:string,eventId:string)=>Promise<ContactRow|null>;
};

const asRecord=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

export async function resolveAutomationContact(event:AutomationEventRef,lookups:ContactResolvers):Promise<ContactRow|null>{
 const {workspace_id:workspaceId,aggregate_type:aggregateType,aggregate_id:aggregateId}=event;
 if(aggregateType==='contact')return lookups.getContact(workspaceId,aggregateId);
 if(aggregateType==='deal'){
  const deal=await lookups.getDeal(workspaceId,aggregateId);
  if(!deal?.contact_id)return null;
  const contact=await lookups.getContact(workspaceId,String(deal.contact_id));
  return contact?{...contact,deal_id:deal.id,pipeline_id:deal.pipeline_id,stage_id:deal.stage_id,deal_status:deal.status}:null;
 }

 const context=asRecord(event.context);
 const ingestionEventId=typeof context.ingestion_event_id==='string'?context.ingestion_event_id:'';
 if(ingestionEventId){
  const ingestion=await lookups.getIngestionEvent(workspaceId,ingestionEventId);
  if(ingestion?.contact_id){
   const contact=await lookups.getContact(workspaceId,String(ingestion.contact_id));
   if(contact)return{...contact,form_id:ingestion.form_id};
  }
 }

 // The legacy outbox contract used either the linked contact ID or ingestion ID
 // as aggregate_id. Resolve the direct contact first, then preserve the old ID path.
 const directContact=await lookups.getContact(workspaceId,aggregateId);
 if(directContact)return directContact;
 const ingestion=await lookups.getIngestionEvent(workspaceId,aggregateId);
 if(!ingestion?.contact_id)return null;
 const contact=await lookups.getContact(workspaceId,String(ingestion.contact_id));
 return contact?{...contact,form_id:ingestion.form_id}:null;
}
