/**
 * React REST/RPC adapter for the existing non-SDK crmApi wrapper.
 * Backend v2 functions are SECURITY INVOKER and enforce original RLS.
 * No global snapshot, offset pagination, or personal-document fields.
 */
import { crmApi } from './api';

export type Cursor = { created_at: string; id: string };
export type ContactSummary = {
  id: string; workspace_id: string; name: string; email: string | null;
  phone: string | null; company: string | null; source: string | null;
  status: 'new'|'contacted'|'qualified'|'customer'|'lost';
  owner_id: string | null; campaign: string | null; created_at: string; updated_at: string;
};
export type DealSummary = {
  id: string; workspace_id: string; contact_id: string; pipeline_id: string;
  stage_id: string; name: string; value: number | string; status: 'open'|'won'|'lost';
  owner_id: string | null; expected_close: string | null;
  loss_reason: string | null; lost_at: string | null; created_at: string; updated_at: string;
};
export type Page<T> = { rows: T[]; has_more: boolean; page_size: number; next: Cursor | null };
export type ContactFilters = {
  search?: string; status?: string; source?: string; owner?: string;
  from?: string; until?: string;
};
export type DealFilters = { status?:string; pipeline?:string;stage?:string;owner?:string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assertUuid = (s:string) => { if (!UUID.test(s)) throw new Error('Identificador invalido.'); };
const assertCursor = (cursor?:Cursor) => {
  if (!cursor) return;
  assertUuid(cursor.id);
  if (!Number.isFinite(Date.parse(cursor.created_at))) throw new Error('Cursor invalido.');
};
const ensurePage = <T extends {id:string;created_at:string}>(value:unknown,limit:number):Page<T> => {
  if (!value || typeof value !== 'object') throw new Error('Resposta de pagina invalida');
  const response=value as { rows?:unknown;has_more?:unknown;page_size?:unknown };
  if (!Array.isArray(response.rows) || response.rows.length>limit || typeof response.has_more!=='boolean')
    throw new Error('Contrato da API de pagina violado');
  const rows=response.rows as T[];
  const last=rows[rows.length-1];
  return {rows,has_more:response.has_more,page_size:limit,
    next:response.has_more && last ? {created_at:last.created_at,id:last.id}:null};
};
export async function fetchContactsPage(input:{workspaceId:string;limit?:number;cursor?:Cursor;filters?:ContactFilters}):Promise<Page<ContactSummary>>{
  if(!crmApi) throw new Error('Supabase nao configurado');
  assertUuid(input.workspaceId);assertCursor(input.cursor);
  const limit=Math.max(1,Math.min(100,Math.trunc(input.limit ?? 50)));
  const filters=input.filters ?? {};
  if(filters.owner) assertUuid(filters.owner);
  const payload={p_workspace:input.workspaceId,p_limit:limit,
    p_before_created_at:input.cursor?.created_at ?? null,p_before_id:input.cursor?.id ?? null,
    p_status:filters.status || null,p_source:filters.source || null,p_owner:filters.owner || null,
    p_search:filters.search?.trim().slice(0,120) || null,p_from:filters.from || null,p_until:filters.until || null};
  return ensurePage<ContactSummary>(await crmApi.rpc('core_contacts_page_v2',payload),limit);
}
export async function fetchDealsPage(input:{workspaceId:string;limit?:number;cursor?:Cursor;filters?:DealFilters}):Promise<Page<DealSummary>>{
  if(!crmApi) throw new Error('Supabase nao configurado');
  assertUuid(input.workspaceId);assertCursor(input.cursor);
  const limit=Math.max(1,Math.min(100,Math.trunc(input.limit ?? 50)));
  const f=input.filters ?? {};
  for(const id of [f.pipeline,f.stage,f.owner])if(id)assertUuid(id);
  return ensurePage<DealSummary>(await crmApi.rpc('core_deals_page_v2',{
    p_workspace:input.workspaceId,p_limit:limit,
    p_before_created_at:input.cursor?.created_at??null,p_before_id:input.cursor?.id??null,
    p_status:f.status||null,p_pipeline:f.pipeline||null,p_stage:f.stage||null,p_owner:f.owner||null
  }),limit);
}
export async function fetchBasicContactDetail(workspaceId:string,contactId:string):Promise<Record<string,unknown>|null>{
  if(!crmApi) throw new Error('Supabase nao configurado');assertUuid(workspaceId);assertUuid(contactId);
  return crmApi.rpc('core_contact_detail_basic_v2',{p_workspace:workspaceId,p_contact:contactId}) as Promise<Record<string,unknown>|null>;
}
export async function contactIdentityExists(workspaceId:string,email?:string,phone?:string){
  if(!crmApi) throw new Error('Supabase nao configurado');assertUuid(workspaceId);
  return crmApi.rpc('core_contact_identity_exists_v2',{p_workspace:workspaceId,p_email:email||null,p_phone:phone||null}) as Promise<{email_exists:boolean;phone_exists:boolean;conflicting_identities:boolean}>;
}
export async function fetchDashboardSummary(workspaceId:string):Promise<Record<string,unknown>>{
  if(!crmApi) throw new Error('Supabase nao configurado');assertUuid(workspaceId);
  return crmApi.rpc('core_dashboard_summary_v2',{p_workspace:workspaceId}) as Promise<Record<string,unknown>>;
}

/** Totais reais do dashboard com filtros, sem carregar contatos/deals inteiros. */
export async function fetchFilteredDashboard(input:{workspaceId:string;startDate:string;endDate:string;teamId?:string|null}):Promise<{
  contacts:number;open_deals:number;pipeline_value:number;won_deals:number;won_value:number;
  velocity_days:number;period_start:string;period_end:string;team_id:string|null
}>{
  if(!crmApi)throw new Error('Supabase nao configurado');assertUuid(input.workspaceId);
  if(input.teamId)assertUuid(input.teamId);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate))
    throw new Error('Data invalida');
  return crmApi.rpc('core_dashboard_filtered_v2',{
    p_workspace:input.workspaceId,p_start:input.startDate,p_end:input.endDate,p_team:input.teamId||null
  }) as Promise<{contacts:number;open_deals:number;pipeline_value:number;won_deals:number;won_value:number;
    velocity_days:number;period_start:string;period_end:string;team_id:string|null}>;
}
