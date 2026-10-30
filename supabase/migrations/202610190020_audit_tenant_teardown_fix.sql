-- Allow tenant teardown without audit inserts referencing a deleted workspace.
begin;
create or replace function public.core_audit_trigger() returns trigger
language plpgsql security definer set search_path='' as $fn$
declare w uuid; rid text;
begin
 if tg_op='DELETE' then w=old.workspace_id;rid=old.id::text; else w=new.workspace_id;rid=new.id::text; end if;
 if exists(select 1 from public.core_workspaces where id=w) then
  insert into public.core_audit_logs(workspace_id,actor_id,table_name,operation,record_id)
  values(w,auth.uid(),tg_table_name,tg_op,rid);
 end if;
 return coalesce(new,old);
end $fn$;
commit;
