begin;
create or replace function public.core_my_profile_save(
  p_full_name text,
  p_phone text,
  p_job_title text,
  p_avatar_data text
)
returns table(
  user_id uuid,
  full_name text,
  phone text,
  job_title text,
  avatar_data text,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  insert into public.core_user_profiles(user_id,full_name,phone,job_title,avatar_data)
  values(
    auth.uid(),
    nullif(btrim(p_full_name),''),
    nullif(btrim(p_phone),''),
    nullif(btrim(p_job_title),''),
    nullif(p_avatar_data,'')
  )
  on conflict on constraint core_user_profiles_pkey do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      job_title = excluded.job_title,
      avatar_data = excluded.avatar_data,
      updated_at = now()
  returning core_user_profiles.user_id,
            core_user_profiles.full_name,
            core_user_profiles.phone,
            core_user_profiles.job_title,
            core_user_profiles.avatar_data,
            core_user_profiles.updated_at;
end $$;
revoke all on function public.core_my_profile_save(text,text,text,text) from public,anon;
grant execute on function public.core_my_profile_save(text,text,text,text) to authenticated;
commit;
