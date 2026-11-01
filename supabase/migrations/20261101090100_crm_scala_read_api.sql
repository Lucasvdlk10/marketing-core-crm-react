-- Marketing Core: API de leitura escalavel, aditiva, sem alterar contratos existentes.
-- Base: catalogo de staging 2026-10-31. Verificar supabase/preflight ANTES de aplicar.
-- Invoker respeita RLS existente; workspace informado nao concede acesso por si.
begin;

create or replace function public.core_contacts_page_v2(
  p_workspace uuid,
  p_limit int default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_status text default null,
  p_source text default null,
  p_owner uuid default null,
  p_search text default null,
  p_from timestamptz default null,
  p_until timestamptz default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $fn$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
  v_count bigint;
  v_rows jsonb;
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search,'')),'');
begin
  if auth.uid() is null or not public.core_has_permission(p_workspace,'contacts.read') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'Cursor requires timestamp and id' using errcode='22023';
  end if;
  if p_until is not null and p_from is not null and p_until <= p_from then
    raise exception 'Invalid date range' using errcode='22023';
  end if;
  if length(coalesce(v_search,'')) > 120 then
    raise exception 'Search too long' using errcode='22023';
  end if;
  -- v_search e escape literal: usuario nao injeta curingas % e _.
  if v_search is not null then
    v_search := replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  end if;
  select count(*), coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) - 'rn' order by q.created_at desc,q.id desc)
    filter (where q.rn <= v_limit), '[]'::jsonb)
  into v_count,v_rows
  from (
    select row_number() over (order by r.created_at desc,r.id desc) as rn, r.*
    from (
      select c.id,c.workspace_id,c.name,c.email,c.phone,c.company,c.source,c.status,
             c.owner_id,c.campaign,c.created_at,c.updated_at
      from public.core_contacts c
      where c.workspace_id=p_workspace
        and (p_before_id is null or (c.created_at,c.id) < (p_before_created_at,p_before_id))
        and (p_status is null or c.status=p_status)
        and (p_source is null or c.source=p_source)
        and (p_owner is null or c.owner_id=p_owner)
        and (p_from is null or c.created_at >= p_from)
        and (p_until is null or c.created_at < p_until)
        and (v_search is null or c.name ilike '%'||v_search||'%' escape E'\\'
          or coalesce(c.email,'') ilike '%'||v_search||'%' escape E'\\'
          or coalesce(c.company,'') ilike '%'||v_search||'%' escape E'\\'
          or coalesce(c.phone,'') ilike '%'||v_search||'%' escape E'\\')
      order by c.created_at desc,c.id desc
      limit v_limit+1
    ) r
  ) q;
  return pg_catalog.jsonb_build_object('rows',v_rows,'has_more',v_count>v_limit,'page_size',v_limit);
end $fn$;

create or replace function public.core_deals_page_v2(
  p_workspace uuid, p_limit int default 50,
  p_before_created_at timestamptz default null, p_before_id uuid default null,
  p_status text default null, p_pipeline uuid default null, p_stage uuid default null,
  p_owner uuid default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare v_limit integer := greatest(1,least(coalesce(p_limit,50),100)); v_count bigint;v_rows jsonb;
begin
  if auth.uid() is null or not public.core_has_permission(p_workspace,'deals.read') then raise exception 'Forbidden' using errcode='42501'; end if;
  if (p_before_created_at is null) <> (p_before_id is null) then raise exception 'Incomplete cursor' using errcode='22023'; end if;
  select count(*),coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q)-'rn' order by q.created_at desc,q.id desc)
    filter (where q.rn<=v_limit),'[]'::jsonb) into v_count,v_rows
  from (
    select row_number() over (order by r.created_at desc,r.id desc) rn,r.* from (
      select d.id,d.workspace_id,d.contact_id,d.pipeline_id,d.stage_id,d.name,d.value,d.status,
             d.owner_id,d.expected_close,d.loss_reason,d.lost_at,d.created_at,d.updated_at
      from public.core_deals d
      where d.workspace_id=p_workspace
        and (p_before_id is null or (d.created_at,d.id)<(p_before_created_at,p_before_id))
        and (p_status is null or d.status=p_status)
        and (p_pipeline is null or d.pipeline_id=p_pipeline)
        and (p_stage is null or d.stage_id=p_stage)
        and (p_owner is null or d.owner_id=p_owner)
      order by d.created_at desc,d.id desc limit v_limit+1
    ) r
  ) q;
  return pg_catalog.jsonb_build_object('rows',v_rows,'has_more',v_count>v_limit,'page_size',v_limit);
end $fn$;

-- Detalhe minimo (nao retorna notes, custom_fields, utm, CPF ou CNPJ).
-- NOTA: isto nao remove a capacidade de SELECT direto existente na tabela.
create or replace function public.core_contact_detail_basic_v2(p_workspace uuid,p_contact uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare v_row jsonb;
begin
 if auth.uid() is null or not public.core_has_permission(p_workspace,'contacts.read') then raise exception 'Forbidden' using errcode='42501'; end if;
 select pg_catalog.to_jsonb(c) into v_row from (
   select id,workspace_id,name,email,phone,company,source,campaign,source_url,status,
          owner_id,consent,consent_at,created_at,updated_at
   from public.core_contacts where workspace_id=p_workspace and id=p_contact
 ) c;
 return v_row;
end $fn$;

-- Checagem UX, NAO substitui unique indexes e tratamento de conflito na escrita.
create or replace function public.core_contact_identity_exists_v2(p_workspace uuid,p_email text default null,p_phone text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare v_email text:=nullif(lower(btrim(coalesce(p_email,''))),'');
        v_phone text:=nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'');
        v_e uuid;v_p uuid;
begin
 if auth.uid() is null or not public.core_has_permission(p_workspace,'contacts.read') then raise exception 'Forbidden' using errcode='42501'; end if;
 if v_email is null and v_phone is null then raise exception 'Email or phone required' using errcode='22023'; end if;
 if v_email is not null then
   select id into v_e from public.core_contacts
   where workspace_id=p_workspace and lower(btrim(email))=v_email limit 1;
 end if;
 if v_phone is not null then
   select id into v_p from public.core_contacts
   where workspace_id=p_workspace and regexp_replace(phone,'[^0-9]','','g')=v_phone limit 1;
 end if;
 return jsonb_build_object('email_exists',v_e is not null,'phone_exists',v_p is not null,
   'conflicting_identities',(v_e is not null and v_p is not null and v_e<>v_p));
end $fn$;

revoke all on function public.core_contacts_page_v2(uuid,int,timestamptz,uuid,text,text,uuid,text,timestamptz,timestamptz),
 public.core_deals_page_v2(uuid,int,timestamptz,uuid,text,uuid,uuid,uuid),
 public.core_contact_detail_basic_v2(uuid,uuid),public.core_contact_identity_exists_v2(uuid,text,text) from public,anon;
grant execute on function public.core_contacts_page_v2(uuid,int,timestamptz,uuid,text,text,uuid,text,timestamptz,timestamptz),
 public.core_deals_page_v2(uuid,int,timestamptz,uuid,text,uuid,uuid,uuid),
 public.core_contact_detail_basic_v2(uuid,uuid),public.core_contact_identity_exists_v2(uuid,text,text) to authenticated;
commit;
