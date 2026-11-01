-- API agregada para dashboard filtrado por datas e equipe.
-- Replica as regras de datas que hoje estao no DashboardPage: deals criados no periodo,
-- won filtrado por updated_at. Sem listar contatos/deals no browser.
begin;
create or replace function public.core_dashboard_filtered_v2(
 p_workspace uuid,p_start date,p_end date,p_team uuid default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare v_from timestamptz;v_until timestamptz;v_team_members uuid[];
 v_contacts bigint;v_open bigint;v_pipeline numeric;v_won bigint;v_won_value numeric;v_velocity numeric;
begin
 if auth.uid() is null or not public.core_has_access(p_workspace) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_start is null or p_end is null or p_start>p_end or p_end-p_start>366
 then raise exception 'Invalid date range (max 366 days)' using errcode='22023'; end if;
 if p_team is not null then
   select t.member_ids into v_team_members from public.core_team_groups(p_workspace) t where t.id=p_team;
   if not found then raise exception 'Team not in workspace' using errcode='22023'; end if;
 end if;
 v_from:=p_start::timestamptz;v_until:=(p_end+1)::timestamptz;
 -- Dependencia de timezone: necessario padronizar timezone da conexao/negocio.
 select count(*) into v_contacts from public.core_contacts c
 where c.workspace_id=p_workspace and c.created_at>=v_from and c.created_at<v_until
 and (p_team is null or c.owner_id=any(v_team_members));
 select count(*) filter(where d.status='open'),
        coalesce(sum(d.value) filter(where d.status='open'),0)
 into v_open,v_pipeline
 from public.core_deals d
 where d.workspace_id=p_workspace and d.created_at>=v_from and d.created_at<v_until
 and (p_team is null or d.owner_id=any(v_team_members));
 select count(*),coalesce(sum(d.value),0),
        coalesce(avg(greatest(0,extract(epoch from d.updated_at-d.created_at))/86400),0)
 into v_won,v_won_value,v_velocity
 from public.core_deals d
 where d.workspace_id=p_workspace and d.status='won'
 and d.updated_at>=v_from and d.updated_at<v_until
 and (p_team is null or d.owner_id=any(v_team_members));
 return jsonb_build_object('contacts',v_contacts,'open_deals',v_open,'pipeline_value',v_pipeline,
  'won_deals',v_won,'won_value',v_won_value,'velocity_days',round(v_velocity,2),
  'period_start',p_start,'period_end',p_end,'team_id',p_team);
end $fn$;
revoke all on function public.core_dashboard_filtered_v2(uuid,date,date,uuid) from public,anon;
grant execute on function public.core_dashboard_filtered_v2(uuid,date,date,uuid) to authenticated;
commit;
