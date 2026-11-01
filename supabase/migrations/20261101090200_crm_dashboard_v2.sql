-- Nova RPC paralela, nao modifica dashboard legado ate testes de paridade.
begin;
create or replace function public.core_dashboard_summary_v2(p_workspace uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare v_total bigint;v_recent bigint;v_funnel jsonb;v_daily jsonb;
 v_open bigint;v_pipeline numeric;v_won numeric;v_due bigint;
begin
 if auth.uid() is null or not public.core_has_access(p_workspace) then raise exception 'Forbidden' using errcode='42501'; end if;
 -- 1 leitura de core_contacts para total, novos, funil (agrupados).
 select coalesce(sum(z.n),0),coalesce(sum(z.recent),0),
   coalesce(jsonb_object_agg(z.status,z.n),'{}'::jsonb)
 into v_total,v_recent,v_funnel
 from (select status,count(*) n,count(*) filter(where created_at>=now()-interval '30 days') recent
       from public.core_contacts where workspace_id=p_workspace group by status) z;
 -- Serie temporal: leitura restrita a 14 dias.
 select coalesce(jsonb_agg(jsonb_build_object('day',d.dt,'count',d.n) order by d.dt),'[]'::jsonb)
 into v_daily
 from (select date_trunc('day',created_at)::date dt,count(*) n
       from public.core_contacts where workspace_id=p_workspace and created_at>=now()-interval '14 days' group by 1) d;
 select count(*) filter(where status='open'),coalesce(sum(value) filter(where status='open'),0),
        coalesce(sum(value) filter(where status='won'),0)
 into v_open,v_pipeline,v_won from public.core_deals
 where workspace_id=p_workspace and status in ('open','won');
 select count(*) into v_due from public.core_tasks
 where workspace_id=p_workspace and status='todo' and due_at<now()+interval '1 day';
 return jsonb_build_object('contacts',v_total,'new_30d',v_recent,'funnel',v_funnel,'daily',v_daily,
    'open_deals',v_open,'pipeline_value',v_pipeline,'won_value',v_won,'tasks_due',v_due);
end $fn$;
revoke all on function public.core_dashboard_summary_v2(uuid) from public,anon;
grant execute on function public.core_dashboard_summary_v2(uuid) to authenticated;
commit;
