-- Fix publication name normalization on PostgreSQL.
begin;
create or replace function public.core_automation_publish(p_workspace uuid,p_rule_id uuid,p_name text,p_graph jsonb,p_expected_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare uid uuid:=auth.uid(); rid uuid; rev_id uuid; rev_no integer; actual_hash text; bound_creator uuid;
begin
 if uid is null then raise exception 'Login required' using errcode='28000'; end if;
 if not public.core_has_permission(p_workspace,'automations.write') then raise exception 'Forbidden' using errcode='42501'; end if;
 if not public.core_automation_graph_v1_valid(p_graph) then raise exception 'Invalid automation graph' using errcode='22023'; end if;
 if pg_catalog.length(pg_catalog.btrim(p_name)) not between 1 and 200 then raise exception 'Invalid rule name'; end if;
 actual_hash=pg_catalog.encode(extensions.digest(p_graph::text,'sha256'),'hex');
 if p_expected_hash is not null and p_expected_hash<>actual_hash then raise exception 'Graph hash mismatch' using errcode='22023'; end if;
 if p_rule_id is null then
  insert into public.core_automation_rules(workspace_id,name,enabled,creator_id) values(p_workspace,pg_catalog.btrim(p_name),false,uid) returning id into rid;
 else
  select id,creator_id into rid,bound_creator from public.core_automation_rules where workspace_id=p_workspace and id=p_rule_id for update;
  if not found then raise exception 'Rule not found' using errcode='P0002'; end if;
  if bound_creator is null then
   update public.core_automation_rules set creator_id=uid where workspace_id=p_workspace and id=rid and creator_id is null;
  elsif bound_creator is distinct from uid then raise exception 'Rule creator is immutable' using errcode='42501'; end if;
  update public.core_automation_rules set name=pg_catalog.btrim(p_name),updated_at=now() where workspace_id=p_workspace and id=rid;
 end if;
 select id into rev_id from public.core_automation_rule_revisions where workspace_id=p_workspace and rule_id=rid and graph_hash=actual_hash;
 if rev_id is null then
  select coalesce(max(revision),0)+1 into rev_no from public.core_automation_rule_revisions where workspace_id=p_workspace and rule_id=rid;
  insert into public.core_automation_rule_revisions(workspace_id,rule_id,revision,graph,graph_hash,creator_id)
   values(p_workspace,rid,rev_no,p_graph,actual_hash,uid)
   on conflict (workspace_id, rule_id, graph_hash) do update set graph_hash=excluded.graph_hash returning id into rev_id;
 end if;
 return jsonb_build_object('rule_id',rid,'revision_id',rev_id,'graph_hash',actual_hash);
end $fn$;
commit;
