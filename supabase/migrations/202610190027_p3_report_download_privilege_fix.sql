-- Authorize private report manifests through a permission-checking definer RPC.
begin;
create or replace function public.core_report_download_authorize(p_job_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare j public.core_report_jobs%rowtype; begin select * into j from public.core_report_jobs where id=p_job_id and status='COMPLETED'; if not found or not public.core_job_owner_or_admin(j.workspace_id,j.requested_by) or exists(select 1 from public.core_memberships where workspace_id=j.workspace_id and user_id=auth.uid() and active and role='viewer') then raise exception 'Permission denied' using errcode='42501'; end if; return jsonb_build_object('workspace_id',j.workspace_id,'row_count',j.emitted_row_count,'parts',(select jsonb_agg(jsonb_build_object('path',artifact_path,'sha256',artifact_sha256,'byte_count',artifact_bytes,'row_count',row_count) order by part_no) from public.core_report_parts where job_id=j.id)); end $fn$;
commit;
