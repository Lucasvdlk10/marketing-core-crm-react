-- Rollback-only staging contract for multipart lead ingestion.
-- Exercises the same service-role RPCs called by core-webhook-v2; all artifacts roll back.
-- No event context is mutated directly; automation assertions inspect trigger-produced rows.
do $contract$
declare
  v_workspace uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_user_email text := 'ingestion-history-' || replace(v_actor::text,'-','') || '@example.invalid';
  v_workspace_name text := 'synthetic-ingestion-history-' || replace(v_workspace::text,'-','');
  v_submission_id text := 'synthetic-ingestion-history-' || gen_random_uuid()::text;
  v_api_key text := encode(extensions.gen_random_bytes(32),'hex');
  v_ingest_key_id uuid;
  v_authorized_workspace uuid;
  v_partial_key text := 'ingest-history-partial-' || gen_random_uuid()::text;
  v_complete_key text := 'ingest-history-complete-' || gen_random_uuid()::text;
  v_followup_key text := 'ingest-history-followup-' || gen_random_uuid()::text;
  v_email text := 'ingestion-history-' || replace(gen_random_uuid()::text,'-','') || '@example.invalid';
  v_partial_payload jsonb;
  v_complete_payload jsonb;
  v_followup_payload jsonb;
  v_changed_payload jsonb;
  v_changed_conflict_detected boolean;
  v_result jsonb;
  v_duplicate jsonb;
  v_partial_event uuid;
  v_complete_event uuid;
  v_followup_event uuid;
  v_contact_id uuid;
  v_event_count integer;
  v_activity_count integer;
  v_partial_automation integer;
  v_complete_automation integer;
  v_followup_automation integer;
  v_expected_outbox integer;
  v_unexpected_outbox integer;
  v_partial_activity_count integer;
  v_complete_activity_count integer;
  v_followup_activity_count integer;
  v_submission_link_count integer;
  v_contact_company text;
  v_contact_campaign text;
  v_contact_source_url text;
  v_contact_consent boolean;
  v_contact_utm jsonb;
  v_outer_ingestion_ids uuid[];
  v_outer_activity_ids uuid[];
  v_outer_automation_event_ids uuid[];
  v_outer_delivery_ids uuid[];
  v_outer_continuation_ids uuid[];
  v_outer_contact_ids uuid[];
  v_outer_audit_ids bigint[];
  v_outer_platform_audit_ids bigint[];
  v_outer_deal_ids uuid[];
  v_outer_rate_buckets timestamptz[];
  v_outer_submission_ids text[];
  v_outer_ingest_key_id uuid;
  v_outer_actor uuid;
  v_outer_workspace uuid;
  v_residuals bigint;
begin
  begin
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
    values('00000000-0000-0000-0000-000000000000',v_actor,'authenticated','authenticated',v_user_email,'',now(),'{}','{}');
    insert into public.core_workspaces(id,name,slug,created_by,state)
    values(v_workspace,v_workspace_name,'ingest-history-'||replace(v_workspace::text,'-',''),v_actor,'active');
    insert into public.core_memberships(workspace_id,user_id,role,active)
    values(v_workspace,v_actor,'owner',true);

    perform set_config('request.jwt.claim.role','service_role',true);
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    if not has_function_privilege('service_role','public.core_ingest_authorize_v2(text)','EXECUTE')
      or has_function_privilege('anon','public.core_ingest_authorize_v2(text)','EXECUTE')
      or has_function_privilege('authenticated','public.core_ingest_authorize_v2(text)','EXECUTE')
      or not has_function_privilege('service_role','public.core_ingest_lead_v2(uuid,text,jsonb)','EXECUTE')
      or has_function_privilege('anon','public.core_ingest_lead_v2(uuid,text,jsonb)','EXECUTE')
      or has_function_privilege('authenticated','public.core_ingest_lead_v2(uuid,text,jsonb)','EXECUTE') then
      raise exception 'Ingestion v2 RPC grants are not service-role-only';
    end if;

    insert into core_private.ingest_keys(workspace_id,label,key_digest)
    values(v_workspace,'synthetic-ingestion-history-'||replace(v_workspace::text,'-',''),encode(extensions.digest(pg_catalog.convert_to(v_api_key,'UTF8'),'sha256'),'hex'))
    returning id into v_ingest_key_id;
    v_outer_ingest_key_id:=v_ingest_key_id;
    v_outer_actor:=v_actor;
    v_outer_workspace:=v_workspace;
    v_authorized_workspace:=public.core_ingest_authorize_v2(v_api_key);
    if v_authorized_workspace is distinct from v_workspace then
      raise exception 'Synthetic API-key authorization returned the wrong workspace';
    end if;
    if auth.role() is distinct from 'service_role' then
      raise exception 'Synthetic API-key authorization changed the role; expected service_role';
    end if;

    v_partial_payload:=jsonb_build_object(
      'submission_id',v_submission_id,
      'source','synthetic-leads-hub',
      'raw_fields',jsonb_build_object('submission_id',v_submission_id,'step',1,'sintoma','synthetic partial before identity')
    );
    v_result:=public.core_ingest_lead_v2(v_workspace,v_partial_key,v_partial_payload);
    v_partial_event:=(v_result->>'event_id')::uuid;
    if v_result->>'duplicate' is distinct from 'false' or v_partial_event is null or v_result->>'contact_id' is not null then
      raise exception 'Identity-free first part was not retained as an unlinked non-automation event';
    end if;

    v_complete_payload:=jsonb_build_object(
      'name','Synthetic Multipart Contact',
      'email',v_email,
      'company','Synthetic Test Co',
      'source','synthetic-leads-hub',
      'campaign','multipart-contract',
      'source_url','https://example.invalid/ingestion-contract',
      'form_id','synthetic-multipart-form',
      'consent',true,
      'submission_id',v_submission_id,
      'utm',jsonb_build_object('source','newsletter','medium','email','campaign','multipart-contract'),
      'raw_fields',jsonb_build_object('nome','Synthetic Multipart Contact','email',v_email,'empresa','Synthetic Test Co','submission_id',v_submission_id,'step',2,'extra',jsonb_build_object('nested',true))
    );
    v_result:=public.core_ingest_lead_v2(v_workspace,v_complete_key,v_complete_payload);
    v_complete_event:=(v_result->>'event_id')::uuid;
    v_contact_id:=(v_result->>'contact_id')::uuid;
    if v_result->>'duplicate' is distinct from 'false' or v_complete_event is null or v_contact_id is null then
      raise exception 'Complete part did not create/link a contact and ingestion event';
    end if;

    v_duplicate:=public.core_ingest_lead_v2(v_workspace,v_complete_key,v_complete_payload);
    if v_duplicate->>'duplicate' is distinct from 'true'
      or (v_duplicate->>'event_id')::uuid is distinct from v_complete_event
      or (v_duplicate->>'contact_id')::uuid is distinct from v_contact_id then
      raise exception 'Exact idempotent retry did not return the original event/contact';
    end if;

    v_changed_payload:=jsonb_set(v_complete_payload,'{company}','"Changed synthetic company"'::jsonb,true);
    v_changed_conflict_detected:=false;
    begin
      perform public.core_ingest_lead_v2(v_workspace,v_complete_key,v_changed_payload);
    exception when unique_violation then
      if sqlerrm<>'Idempotency conflict' then raise; end if;
      v_changed_conflict_detected:=true;
    end;
    if not v_changed_conflict_detected then raise exception 'Changed-body retry returned successfully instead of an idempotency conflict'; end if;

    v_followup_payload:=jsonb_build_object(
      'submission_id',v_submission_id,
      'source','synthetic-leads-hub',
      'utm',jsonb_build_object('content','multipart-follow-up'),
      'raw_fields',jsonb_build_object('submission_id',v_submission_id,'step',3,'utm_content','multipart-follow-up','extra',jsonb_build_object('nested',true))
    );
    v_result:=public.core_ingest_lead_v2(v_workspace,v_followup_key,v_followup_payload);
    v_followup_event:=(v_result->>'event_id')::uuid;
    if v_result->>'duplicate' is distinct from 'false'
      or v_followup_event is null
      or (v_result->>'contact_id')::uuid is distinct from v_contact_id then
      raise exception 'Follow-up part was not linked to the submission contact';
    end if;

    select count(*),
      count(*) filter(where id=v_partial_event and contact_id=v_contact_id and automation_enabled is false),
      count(*) filter(where id=v_complete_event and contact_id=v_contact_id and automation_enabled is true),
      count(*) filter(where id=v_followup_event and contact_id=v_contact_id and automation_enabled is false)
    into v_event_count,v_partial_automation,v_complete_automation,v_followup_automation
    from public.core_ingestion_events
    where workspace_id=v_workspace and id=any(array[v_partial_event,v_complete_event,v_followup_event]);
    if v_event_count<>3 or v_partial_automation<>1 or v_complete_automation<>1 or v_followup_automation<>1 then
      raise exception 'Multipart ingestion event linking or one-time automation flags are incorrect';
    end if;

    select count(*) filter(where event_type='WEBHOOK_RECEIVED' and context->>'ingestion_event_id'=v_complete_event::text),
      count(*) filter(where event_type='WEBHOOK_RECEIVED' and context->>'ingestion_event_id' in (v_partial_event::text,v_followup_event::text))
    into v_expected_outbox,v_unexpected_outbox
    from public.core_automation_events where workspace_id=v_workspace;
    if v_expected_outbox<>1 or v_unexpected_outbox<>0 then
      raise exception 'Only the first complete identity-bearing part should enqueue WEBHOOK_RECEIVED automation';
    end if;

    select count(*) filter(where ingestion_event_id=v_partial_event and contact_id=v_contact_id and body::jsonb=v_partial_payload->'raw_fields'),
      count(*) filter(where ingestion_event_id=v_complete_event and contact_id=v_contact_id and body::jsonb=v_complete_payload->'raw_fields'),
      count(*) filter(where ingestion_event_id=v_followup_event and contact_id=v_contact_id and body::jsonb=v_followup_payload->'raw_fields'),
      count(*)
    into v_partial_activity_count,v_complete_activity_count,v_followup_activity_count,v_activity_count
    from public.core_activities where workspace_id=v_workspace;
    if v_partial_activity_count<>1 or v_complete_activity_count<>1 or v_followup_activity_count<>1 or v_activity_count<>3 then
      raise exception 'Activity history mismatch: expected exactly one correctly linked raw_fields activity per event (partial %, complete %, follow-up %) and exactly three total, found %',
        v_partial_activity_count,v_complete_activity_count,v_followup_activity_count,v_activity_count;
    end if;

    select count(*) into v_submission_link_count from public.core_lead_submission_links
    where workspace_id=v_workspace and submission_id=v_submission_id and contact_id=v_contact_id;
    if v_submission_link_count<>1 then raise exception 'Submission composite link was not created exactly once'; end if;

    select company,campaign,source_url,consent,utm
    into v_contact_company,v_contact_campaign,v_contact_source_url,v_contact_consent,v_contact_utm
    from public.core_contacts where id=v_contact_id and workspace_id=v_workspace;
    if v_contact_company is distinct from 'Synthetic Test Co'
      or v_contact_campaign is distinct from 'multipart-contract'
      or v_contact_source_url is distinct from 'https://example.invalid/ingestion-contract'
      or v_contact_consent is distinct from true
      or v_contact_utm is distinct from jsonb_build_object('source','newsletter','medium','email','campaign','multipart-contract','content','multipart-follow-up') then
      raise exception 'Contact merge/UTM/consent fields did not preserve the multipart payload';
    end if;

    v_outer_ingestion_ids:=array[v_partial_event,v_complete_event,v_followup_event];
    v_outer_submission_ids:=array[v_submission_id];
    select coalesce(array_agg(id),array[]::uuid[]) into v_outer_activity_ids
      from public.core_activities where ingestion_event_id=any(v_outer_ingestion_ids);
    select coalesce(array_agg(id),array[]::uuid[]) into v_outer_automation_event_ids
      from public.core_automation_events where workspace_id=v_workspace;
    select coalesce(array_agg(id),array[]::uuid[]) into v_outer_delivery_ids
      from public.core_automation_deliveries where workspace_id=v_workspace;
    select coalesce(array_agg(id),array[]::uuid[]) into v_outer_continuation_ids
      from public.core_automation_continuations where workspace_id=v_workspace;
    select coalesce(array_agg(id),array[]::uuid[]) into v_outer_contact_ids
      from public.core_contacts where workspace_id=v_workspace and email=v_email;
    select coalesce(array_agg(id),array[]::bigint[]) into v_outer_audit_ids
      from public.core_audit_logs where workspace_id=v_workspace;
    select coalesce(array_agg(id),array[]::bigint[]) into v_outer_platform_audit_ids
      from core_private.platform_audit where workspace_id=v_workspace;
    select coalesce(array_agg(id),array[]::uuid[]) into v_outer_deal_ids
      from public.core_deals where workspace_id=v_workspace;
    select coalesce(array_agg(bucket),array[]::timestamptz[]) into v_outer_rate_buckets
      from core_private.webhook_rate where key_id=v_ingest_key_id;
    if cardinality(v_outer_ingestion_ids)<>3 or cardinality(v_outer_activity_ids)<>3 or cardinality(v_outer_contact_ids)<>1 or cardinality(v_outer_rate_buckets)<>1 then
      raise exception 'Failed to capture direct generated artifact IDs before rollback';
    end if;

    raise exception '__ROLLBACK_INGESTION_HISTORY_CONTRACT__';
  exception when others then
    if sqlerrm<>'__ROLLBACK_INGESTION_HISTORY_CONTRACT__' then raise; end if;
  end;

  if v_outer_workspace is null or v_outer_actor is null or v_outer_ingest_key_id is null
    or cardinality(v_outer_ingestion_ids)<>3 or cardinality(v_outer_submission_ids)<>1 then
    raise exception 'Synthetic ingestion fixture IDs did not survive rollback scope';
  end if;
  select
    (select count(*) from public.core_workspaces where id=v_outer_workspace)+
    (select count(*) from auth.users where id=v_outer_actor)+
    (select count(*) from public.core_user_profiles where user_id=v_outer_actor)+
    (select count(*) from public.core_memberships where workspace_id=v_outer_workspace and user_id=v_outer_actor)+
    (select count(*) from core_private.ingest_keys where id=v_outer_ingest_key_id)+
    (select count(*) from core_private.webhook_rate where key_id=v_outer_ingest_key_id and bucket=any(v_outer_rate_buckets))+
    (select count(*) from public.core_ingestion_events where id=any(v_outer_ingestion_ids))+
    (select count(*) from public.core_activities where id=any(v_outer_activity_ids))+
    (select count(*) from public.core_automation_events where id=any(coalesce(v_outer_automation_event_ids,array[]::uuid[])))+
    (select count(*) from public.core_automation_deliveries where id=any(coalesce(v_outer_delivery_ids,array[]::uuid[])))+
    (select count(*) from public.core_automation_continuations where id=any(coalesce(v_outer_continuation_ids,array[]::uuid[])))+
    (select count(*) from public.core_audit_logs where id=any(coalesce(v_outer_audit_ids,array[]::bigint[])))+
    (select count(*) from core_private.platform_audit where id=any(coalesce(v_outer_platform_audit_ids,array[]::bigint[])))+
    (select count(*) from public.core_contacts where id=any(coalesce(v_outer_contact_ids,array[]::uuid[])))+
    (select count(*) from public.core_lead_submission_links where workspace_id=v_outer_workspace and submission_id=any(v_outer_submission_ids))+
    (select count(*) from public.core_deals where id=any(coalesce(v_outer_deal_ids,array[]::uuid[])))
  into v_residuals;
  if v_residuals<>0 then raise exception 'Synthetic ingestion history fixture left % residue rows',v_residuals; end if;
  raise notice 'PASS: multipart linking, merge/UTM, idempotent retry/conflict, single automation, activity history, service-role guards, and direct zero-residue checks passed; fixture rolled back.';
end
$contract$;
select 'PASS: multipart ingestion regression assertions completed' as result,
  (select count(*) from public.core_workspaces where name like 'synthetic-ingestion-history-%') as residual_test_workspaces,
  (select count(*) from auth.users where email like 'ingestion-history-%@example.invalid') as residual_test_users,
  (select count(*) from core_private.ingest_keys where label like 'synthetic-ingestion-history-%') as residual_test_keys,
  (select count(*) from public.core_ingestion_events where idempotency_key like 'ingest-history-%') as residual_ingestion_events,
  (select count(*) from public.core_activities where submission_id like 'synthetic-ingestion-history-%') as residual_activities,
  (select count(*) from public.core_contacts where email like 'ingestion-history-%@example.invalid') as residual_contacts,
  (select count(*) from public.core_lead_submission_links where submission_id like 'synthetic-ingestion-history-%') as residual_submission_links;