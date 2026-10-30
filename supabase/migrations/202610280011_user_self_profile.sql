begin;
alter table public.core_user_profiles
  add column if not exists phone text,
  add column if not exists job_title text,
  add column if not exists avatar_data text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.core_user_profiles'::regclass
      and conname = 'core_user_profiles_phone_length'
  ) then
    alter table public.core_user_profiles
      add constraint core_user_profiles_phone_length
      check (phone is null or length(phone) <= 50);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.core_user_profiles'::regclass
      and conname = 'core_user_profiles_job_title_length'
  ) then
    alter table public.core_user_profiles
      add constraint core_user_profiles_job_title_length
      check (job_title is null or length(job_title) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.core_user_profiles'::regclass
      and conname = 'core_user_profiles_avatar_data_size'
  ) then
    alter table public.core_user_profiles
      add constraint core_user_profiles_avatar_data_size
      check (avatar_data is null or octet_length(avatar_data) <= 750000);
  end if;
end $$;
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
  on conflict(user_id) do update
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
create or replace function public.core_my_profile_get()
returns table(
  user_id uuid,
  full_name text,
  phone text,
  job_title text,
  avatar_data text,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.user_id,p.full_name,p.phone,p.job_title,p.avatar_data,p.updated_at
  from public.core_user_profiles p
  where p.user_id = auth.uid()
$$;
revoke all on function public.core_my_profile_save(text,text,text,text) from public,anon;
grant execute on function public.core_my_profile_save(text,text,text,text) to authenticated;
revoke all on function public.core_my_profile_get() from public,anon;
grant execute on function public.core_my_profile_get() to authenticated;
commit;
