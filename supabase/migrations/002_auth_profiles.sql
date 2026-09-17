-- SignEng auth profile sync
-- Create the public profile automatically after a Supabase Auth signup.

create or replace function public.handle_new_signeng_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (external_id, email, name, role, status, modules)
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case when lower(new.email) = 'pierreprincipal@gmail.com' then 'admin' else 'user' end,
    'active',
    '[]'::jsonb
  )
  on conflict (external_id) do update set
    email = excluded.email,
    name = excluded.name,
    role = case when lower(excluded.email) = 'pierreprincipal@gmail.com' then 'admin' else public.users.role end,
    updated_at = now();

  insert into public.licenses (user_id, plan, status, paid, expires_at, max_machines)
  select id,
    case when lower(email) = 'pierreprincipal@gmail.com' then 'admin' else 'trial' end,
    'active',
    lower(email) = 'pierreprincipal@gmail.com',
    case when lower(email) = 'pierreprincipal@gmail.com' then null else now() + interval '15 days' end,
    case when lower(email) = 'pierreprincipal@gmail.com' then 999 else 1 end
  from public.users
  where external_id = new.id::text
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_signeng on auth.users;
create trigger on_auth_user_created_signeng
after insert on auth.users
for each row execute procedure public.handle_new_signeng_user();

create policy "users can read own profile"
  on public.users for select to authenticated
  using (external_id = auth.uid()::text);

create policy "users can read own license"
  on public.licenses for select to authenticated
  using (user_id in (select id from public.users where external_id = auth.uid()::text));

update public.public_settings
set value = jsonb_build_object('url', 'https://signeng.online', 'login_required', true), updated_at = now()
where key = 'site';
