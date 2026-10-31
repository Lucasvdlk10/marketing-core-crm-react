-- Transactional staging contract for webhook-specific automation routing and rate limiting.
-- Uses synthetic lead/routing fixtures; the nested exception block rolls them back.
-- A separate release-gate probe verifies the committed 60/61 count and cleanup.
-- Compatibility contract: legacy source rules apply only to identified webhook events; API-key events without webhook identity never match.
do $contract$
declare
  v_workspace uuid := gen_random_uuid();
  v_outer_webhook_id uuid;
  v_outer_other_webhook_id uuid;
  v_outer_webhook_secret_id uuid;
  v_outer_other_webhook_secret_id uuid;
  v_outer_ingest_key_id uuid;
  v_outer_rate_probe_key_id uuid;
  v_outer_event_id uuid;
  v_outer_other_event_id uuid;
  v_outer_api_event_id uuid;
  v_outer_rule_ids uuid[];
  v_outer_revision_ids uuid[];
  v_outer_ingestion_ids uuid[];
  v_outer_activity_ids uuid[];
  v_outer_audit_ids bigint[];
  v_outer_platform_audit_ids bigint[];
  v_outer_automation_event_ids uuid[];
  v_outer_delivery_ids uuid[];
  v_outer_continuation_ids uuid[];
  v_outer_contact_ids uuid[];
  v_outer_deal_ids uuid[];
  v_outer_submission_ids text[];
  v_actor uuid := gen_random_uuid();
  v_webhook_id uuid;
  v_public_id text;
  v_token text;
  v_other_webhook uuid;
  v_other_public_id text;
  v_other_token text;
  v_authorization jsonb;
  v_ingest jsonb;
  v_other_ingest jsonb;
  v_api_ingest jsonb;
  v_api_key text := encode(extensions.gen_random_bytes(32),'hex');
  v_api_workspace uuid;
  v_event_id uuid;
  v_other_event_id uuid;
  v_api_event_id uuid;
  v_worker uuid := gen_random_uuid();
  v_test_key text := 'synthetic-webhook-source-guard-' || gen_random_uuid()::text;
  v_other_test_key text := 'synthetic-webhook-source-guard-other-' || gen_random_uuid()::text;
  v_email text := 'webhook-source-guard-' || replace(gen_random_uuid()::text,'-','') || '@example.invalid';
  v_other_email text := 'webhook-source-guard-other-' || replace(gen_random_uuid()::text,'-','') || '@example.invalid';
  v_user_email text := 'webhook-source-guard-user-' || replace(gen_random_uuid()::text,'-','') || '@example.invalid';
  v_workspace_name text := 'synthetic-webhook-workspace-' || replace(v_workspace::text,'-','');
  v_endpoint_name text := 'synthetic-webhook-source-guard-' || replace(v_workspace::text,'-','');
  v_graph jsonb;
  v_published jsonb;
  v_rule_ids uuid[] := array[null::uuid,null::uuid,null::uuid,null::uuid];
  v_revision_ids uuid[] := array[null::uuid,null::uuid,null::uuid,null::uuid];
  v_source_id text;
  v_source_label text;
  v_residuals bigint;
  v_specific int;
  v_other int;
  v_wildcard int;
  v_legacy int;
  v_api_test_key text := 'synthetic-api-key-source-guard-' || gen_random_uuid()::text;
  v_api_email text := 'api-key-source-guard-' || replace(gen_random_uuid()::text,'-','') || '@example.invalid';
  v_submission_id text := 'synthetic-webhook-source-guard-' || gen_random_uuid()::text;
  v_other_submission_id text := 'synthetic-webhook-source-guard-other-' || gen_random_uuid()::text;
  v_api_submission_id text := 'synthetic-api-key-source-guard-' || gen_random_uuid()::text;
begin
  begin
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
    values('00000000-0000-0000-0000-000000000000',v_actor,'authenticated','authenticated',v_user_email,'',now(),'{}','{}');
    insert into public.core_workspaces(id,name,slug,created_by,state)
    values(v_workspace,v_workspace_name,'webhook-contract-'||replace(v_workspace::text,'-',''),v_actor,'active');
    insert into public.core_memberships(workspace_id,user_id,role,active)
    values(v_workspace,v_actor,'owner',true);

    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    select h.id,h.public_id,h.token into v_webhook_id,v_public_id,v_token
    from public.core_workspace_webhook_create(v_workspace,v_endpoint_name) as h;
    v_outer_webhook_id:=v_webhook_id;
    if v_webhook_id is null or v_public_id is null or v_token is null then raise exception 'Synthetic webhook creation failed'; end if;
    select vault_secret_id into v_outer_webhook_secret_id
    from core_private.workspace_webhooks where id=v_webhook_id and workspace_id=v_workspace and created_by=v_actor;
    if v_outer_webhook_secret_id is null then raise exception 'Synthetic webhook Vault secret id was not captured'; end if;
    select h.id,h.public_id,h.token into v_other_webhook,v_other_public_id,v_other_token
    from public.core_workspace_webhook_create(v_workspace,v_endpoint_name||'-other') as h;
    v_outer_other_webhook_id:=v_other_webhook;
    if v_other_webhook is null or v_other_public_id is null or v_other_token is null then raise exception 'Second synthetic webhook creation failed'; end if;
    select vault_secret_id into v_outer_other_webhook_secret_id
    from core_private.workspace_webhooks where id=v_other_webhook and workspace_id=v_workspace and created_by=v_actor;
    if v_outer_other_webhook_secret_id is null then raise exception 'Second synthetic webhook Vault secret id was not captured'; end if;

    perform set_config('request.jwt.claim.role','service_role',true);
    v_authorization:=public.core_workspace_webhook_authorize_v2(v_public_id,v_token);
    if v_authorization->>'workspace_id' is distinct from v_workspace::text
      or v_authorization->>'webhook_id' is distinct from v_webhook_id::text
      or v_authorization->>'rate_limited' is not null then
      raise exception 'Signed webhook authorization returned the wrong identity';
    end if;

    v_ingest:=public.core_ingest_webhook_lead_v2(
      (v_authorization->>'workspace_id')::uuid,
      v_test_key,
      jsonb_build_object(
        'name','Synthetic webhook routing contract',
        'email',v_email,
        'submission_id',v_submission_id,
        'source','synthetic-test'
      ),
      (v_authorization->>'webhook_id')::uuid
    );
    select e.id into v_event_id
    from public.core_automation_events e
    where e.workspace_id=v_workspace
      and e.event_type='WEBHOOK_RECEIVED'
      and e.context->>'ingestion_event_id'=v_ingest->>'event_id'
      and e.context->>'source_webhook_id'=v_webhook_id::text;
    v_outer_event_id:=v_event_id;
    if v_event_id is null then raise exception 'Signed webhook source identity was not attached to the event'; end if;

    v_authorization:=public.core_workspace_webhook_authorize_v2(v_other_public_id,v_other_token);
    if v_authorization->>'workspace_id' is distinct from v_workspace::text
      or v_authorization->>'webhook_id' is distinct from v_other_webhook::text
      or v_authorization->>'rate_limited' is not null then
      raise exception 'Second webhook authorization returned the wrong identity';
    end if;
    v_other_ingest:=public.core_ingest_webhook_lead_v2(
      (v_authorization->>'workspace_id')::uuid,
      v_other_test_key,
      jsonb_build_object(
        'name','Synthetic second webhook routing contract',
        'email',v_other_email,
        'submission_id',v_other_submission_id,
        'source','synthetic-test'
      ),
      (v_authorization->>'webhook_id')::uuid
    );
    select e.id into v_other_event_id
    from public.core_automation_events e
    where e.workspace_id=v_workspace
      and e.event_type='WEBHOOK_RECEIVED'
      and e.context->>'ingestion_event_id'=v_other_ingest->>'event_id'
      and e.context->>'source_webhook_id'=v_other_webhook::text;
    v_outer_other_event_id:=v_other_event_id;
    if v_other_event_id is null then raise exception 'Second signed webhook identity was not attached to its event'; end if;

    insert into core_private.ingest_keys(workspace_id,label,key_digest)
    values(v_workspace,'synthetic-webhook-source-guard-api',encode(extensions.digest(pg_catalog.convert_to(v_api_key,'UTF8'),'sha256'),'hex')) returning id into v_outer_ingest_key_id;
    select id into v_outer_rate_probe_key_id from core_private.ingest_keys where id=v_outer_ingest_key_id;
    v_api_workspace:=public.core_ingest_authorize_v2(v_api_key);
    if v_api_workspace is distinct from v_workspace then raise exception 'Synthetic API-key authorization failed'; end if;
    v_api_ingest:=public.core_ingest_lead_v2(
      v_api_workspace,
      v_api_test_key,
      jsonb_build_object(
        'name','Synthetic API key routing contract',
        'email',v_api_email,
        'submission_id',v_api_submission_id,
        'source','synthetic-api-key-test'
      )
    );
    select e.id into v_api_event_id
    from public.core_automation_events e
    where e.workspace_id=v_workspace
      and e.event_type='WEBHOOK_RECEIVED'
      and e.context->>'ingestion_event_id'=v_api_ingest->>'event_id'
      and not(e.context?'source_webhook_id');
    v_outer_api_event_id:=v_api_event_id;
    if v_api_event_id is null then raise exception 'API-key ingestion event unexpectedly had webhook identity or was not queued'; end if;

    v_graph:=jsonb_build_object(
      'schema_version','1',
      'nodes',jsonb_build_array(
        jsonb_build_object('id','trigger','type','trigger','subtype','WEBHOOK_RECEIVED','position',jsonb_build_object('x',0,'y',0),'config',jsonb_build_object('source_type','webhook','source_id',v_webhook_id::text,'source_label','Synthetic endpoint')),
        jsonb_build_object('id','task','type','action','subtype','CREATE_TASK','position',jsonb_build_object('x',1,'y',1),'config',jsonb_build_object('title','Synthetic webhook contract task'))
      ),
      'edges',jsonb_build_array(jsonb_build_object('id','edge-1','source','trigger','target','task'))
    );

    for i in 1..4 loop
      if i=2 then v_source_id:=v_other_webhook::text; v_source_label:='Different endpoint';
      elsif i=3 then v_source_id:='webhook-all'; v_source_label:='All endpoints';
      elsif i=4 then v_source_id:='webhook-lead-created'; v_source_label:='Legacy endpoint';
      else v_source_id:=v_webhook_id::text; v_source_label:='Synthetic endpoint';
      end if;
      v_graph:=jsonb_set(v_graph,'{nodes,0,config,source_id}',to_jsonb(v_source_id),true);
      v_graph:=jsonb_set(v_graph,'{nodes,0,config,source_label}',to_jsonb(v_source_label),true);
      v_published:=public.core_automation_publish(v_workspace,null,'synthetic-webhook-source-guard-'||i::text,v_graph,null);
      v_rule_ids[i]:=(v_published->>'rule_id')::uuid;
      v_revision_ids[i]:=(v_published->>'revision_id')::uuid;
      perform public.core_automation_activate(v_workspace,v_rule_ids[i],v_revision_ids[i]);
    end loop;
    v_outer_rule_ids:=v_rule_ids;
    v_outer_revision_ids:=v_revision_ids;

    perform set_config('request.jwt.claim.role','service_role',true);
    update public.core_automation_events
    set status='processing',worker_id=v_worker,lease_until=now()+interval '5 minutes'
    where id=v_event_id;
    select count(*) filter(where rule_id=v_rule_ids[1]),count(*) filter(where rule_id=v_rule_ids[2]),count(*) filter(where rule_id=v_rule_ids[3]),count(*) filter(where rule_id=v_rule_ids[4])
    into v_specific,v_other,v_wildcard,v_legacy
    from public.core_automation_match_active(v_event_id,v_worker);
    if v_specific<>1 or v_other<>0 or v_wildcard<>1 or v_legacy<>1 then raise exception 'Exact webhook, wildcard, or legacy matching failed for an identified webhook event'; end if;

    update public.core_automation_events
    set status='processing',worker_id=v_worker,lease_until=now()+interval '5 minutes'
    where id=v_other_event_id;
    select count(*) filter(where rule_id=v_rule_ids[1]),count(*) filter(where rule_id=v_rule_ids[2]),count(*) filter(where rule_id=v_rule_ids[3]),count(*) filter(where rule_id=v_rule_ids[4])
    into v_specific,v_other,v_wildcard,v_legacy
    from public.core_automation_match_active(v_other_event_id,v_worker);
    if v_specific<>0 or v_other<>1 or v_wildcard<>1 or v_legacy<>1 then raise exception 'Different webhook ID was not routed only to its selected rule plus wildcard/legacy'; end if;

    update public.core_automation_events
    set status='processing',worker_id=v_worker,lease_until=now()+interval '5 minutes'
    where id=v_api_event_id;
    select count(*) filter(where rule_id=v_rule_ids[1]),count(*) filter(where rule_id=v_rule_ids[2]),count(*) filter(where rule_id=v_rule_ids[3]),count(*) filter(where rule_id=v_rule_ids[4])
    into v_specific,v_other,v_wildcard,v_legacy
    from public.core_automation_match_active(v_api_event_id,v_worker);
    if v_specific+v_other+v_wildcard+v_legacy<>0 then raise exception 'API-key ingestion without webhook identity matched a webhook automation'; end if;
    if v_legacy<>0 then raise exception 'API-key event without source_webhook_id matched legacy webhook source'; end if;
    if v_wildcard<>0 then raise exception 'API-key event without source_webhook_id matched webhook-all'; end if;

    v_outer_submission_ids:=array[v_submission_id,v_other_submission_id,v_api_submission_id];
    v_outer_ingestion_ids:=array[(v_ingest->>'event_id')::uuid,(v_other_ingest->>'event_id')::uuid,(v_api_ingest->>'event_id')::uuid];
    v_outer_automation_event_ids:=array[v_outer_event_id,v_outer_other_event_id,v_outer_api_event_id];
    select coalesce(array_agg(id),array[]::uuid[]) into v_outer_activity_ids
      from public.core_activities where ingestion_event_id=any(v_outer_ingestion_ids);
    select coalesce(array_agg(id),array[]::bigint[]) into v_outer_audit_ids
      from public.core_audit_logs where workspace_id=v_workspace;
    select coalesce(array_agg(id),array[]::bigint[]) into v_outer_platform_audit_ids
      from core_private.platform_audit where workspace_id=v_workspace;
    select coalesce(array_agg(id),array[]::uuid[]) into v_outer_delivery_ids
      from public.core_automation_deliveries where workspace_id=v_workspace;
    select coalesce(array_agg(id),array[]::uuid[]) into v_outer_continuation_ids
      from public.core_automation_continuations where workspace_id=v_workspace;
    select coalesce(array_agg(contact_id),array[]::uuid[]) into v_outer_contact_ids
      from public.core_ingestion_events where id=any(v_outer_ingestion_ids) and contact_id is not null;
    select coalesce(array_agg(id),array[]::uuid[]) into v_outer_deal_ids
      from public.core_deals where workspace_id=v_workspace;
    if cardinality(v_outer_ingestion_ids)<>3 or cardinality(v_outer_activity_ids)<>3 or cardinality(v_outer_contact_ids)<>3 then
      raise exception 'Synthetic fixture failed to capture all ingestion/activity/contact IDs before rollback';
    end if;

    raise exception '__ROLLBACK_WEBHOOK_SOURCE_GUARD_CONTRACT__';
  exception when others then
    if sqlerrm<>'__ROLLBACK_WEBHOOK_SOURCE_GUARD_CONTRACT__' then raise; end if;
  end;
  if v_outer_webhook_id is null or v_outer_other_webhook_id is null or v_outer_webhook_secret_id is null or v_outer_other_webhook_secret_id is null or v_outer_ingest_key_id is null or v_outer_event_id is null or v_outer_api_event_id is null then
    raise exception 'Synthetic fixture identifiers were not retained outside the rollback subtransaction';
  end if;
  select
    (select count(*) from public.core_workspaces where id=v_workspace)+
    (select count(*) from auth.users where id=v_actor)+
    (select count(*) from public.core_user_profiles where user_id=v_actor)+
    (select count(*) from public.core_memberships where workspace_id=v_workspace and user_id=v_actor)+
    (select count(*) from core_private.workspace_webhooks where id in (v_outer_webhook_id,v_outer_other_webhook_id))+
    (select count(*) from core_private.workspace_webhook_rate where webhook_id in (v_outer_webhook_id,v_outer_other_webhook_id))+
    (select count(*) from vault.secrets where id in (v_outer_webhook_secret_id,v_outer_other_webhook_secret_id))+
    (select count(*) from core_private.ingest_keys where id=v_outer_ingest_key_id)+
    (select count(*) from core_private.webhook_rate where key_id=v_outer_ingest_key_id)+
    (select count(*) from public.core_audit_logs where id=any(coalesce(v_outer_audit_ids,array[]::bigint[])))+
    (select count(*) from core_private.platform_audit where id=any(coalesce(v_outer_platform_audit_ids,array[]::bigint[])))+
    (select count(*) from public.core_automation_rules where id=any(coalesce(v_outer_rule_ids,array[]::uuid[])))+
    (select count(*) from public.core_automation_rule_revisions where id=any(coalesce(v_outer_revision_ids,array[]::uuid[])))+
    (select count(*) from public.core_automation_events where id=any(coalesce(v_outer_automation_event_ids,array[]::uuid[])))+
    (select count(*) from public.core_automation_deliveries where id=any(coalesce(v_outer_delivery_ids,array[]::uuid[])))+
    (select count(*) from public.core_automation_continuations where id=any(coalesce(v_outer_continuation_ids,array[]::uuid[])))+
    (select count(*) from public.core_ingestion_events where id=any(coalesce(v_outer_ingestion_ids,array[]::uuid[])))+
    (select count(*) from public.core_activities where id=any(coalesce(v_outer_activity_ids,array[]::uuid[])))+
    (select count(*) from public.core_lead_submission_links where workspace_id=v_workspace and submission_id=any(coalesce(v_outer_submission_ids,array[]::text[])))+
    (select count(*) from public.core_contacts where id=any(coalesce(v_outer_contact_ids,array[]::uuid[])))+
    (select count(*) from public.core_deals where id=any(coalesce(v_outer_deal_ids,array[]::uuid[])))
  into v_residuals;
  if v_residuals<>0 then raise exception 'Synthetic webhook contract left % persistent or orphan rows',v_residuals; end if;
  raise notice 'PASS: two signed webhook identities, exact/different/wildcard/legacy routing, API-key no-identity routing, and direct orphan-safe zero-residue checks passed; fixtures rolled back.';
end
$contract$;
select 'PASS: webhook regression assertions completed' as result,
  (select count(*) from public.core_workspaces where name like 'synthetic-webhook-workspace-%') as residual_test_workspaces,
  (select count(*) from auth.users where email like 'webhook-source-guard-user-%@example.invalid') as residual_test_users,
  (select count(*) from core_private.workspace_webhooks where name like 'synthetic-webhook-source-guard-%') as residual_test_webhooks,
  (select count(*) from core_private.workspace_webhook_rate r join core_private.workspace_webhooks w on w.id=r.webhook_id where w.name like 'synthetic-webhook-source-guard-%') as residual_rate_rows,
  (select count(*) from core_private.ingest_keys where label='synthetic-webhook-source-guard-api') as residual_api_keys,
  (select count(*) from core_private.webhook_rate r join core_private.ingest_keys k on k.id=r.key_id where k.label='synthetic-webhook-source-guard-api') as residual_api_key_rate_rows,
  (select count(*) from public.core_automation_rules where name like 'synthetic-webhook-source-guard-%') as residual_test_automations,
  (select count(*) from public.core_ingestion_events where idempotency_key like 'synthetic-webhook-source-guard-%' or idempotency_key like 'synthetic-api-key-source-guard-%') as residual_ingestion_events,
  (select count(*) from public.core_activities where submission_id like 'synthetic-webhook-source-guard-%' or submission_id like 'synthetic-api-key-source-guard-%') as residual_synthetic_activities,
  (select count(*) from public.core_contacts where email like 'webhook-source-guard-%@example.invalid' or email like 'api-key-source-guard-%@example.invalid') as residual_synthetic_contacts;
