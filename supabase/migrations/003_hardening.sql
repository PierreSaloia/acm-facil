-- SignEng hardening — Supabase-only, online-only
-- Idempotente: pode ser executada mais de uma vez sem erro.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Uma licença por usuário (hoje é possível duplicar).
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  alter table public.licenses
    add constraint licenses_user_id_key unique (user_id);
exception
  when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Recria as políticas de 002 de forma idempotente (reexecutar 002 falha
--    hoje porque `create policy` não aceita `if not exists`).
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "users can read own profile" on public.users;
create policy "users can read own profile"
  on public.users for select to authenticated
  using (external_id = auth.uid()::text);

drop policy if exists "users can read own license" on public.licenses;
create policy "users can read own license"
  on public.licenses for select to authenticated
  using (user_id in (select id from public.users where external_id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Corrige o trigger de novo usuário pra usar a constraint acima
--    (antes o "on conflict do nothing" não tinha contra o que conferir).
-- ─────────────────────────────────────────────────────────────────────────
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
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Upsert idempotente de plugin_versions (o "on conflict do nothing"
--    anterior não tinha como saber qual linha antiga desmarcar).
-- ─────────────────────────────────────────────────────────────────────────
update public.plugin_versions set is_latest = false where is_latest = true;

insert into public.plugin_versions (version, download_url, changelog, is_latest)
select '1.9.32', 'https://signeng.online/downloads/SignEng.rbz',
       'Migração completa para Supabase (sem Firebase), sistema somente online.', true
where not exists (
  select 1 from public.plugin_versions where version = '1.9.32'
);

update public.plugin_versions set is_latest = true where version = '1.9.32';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) verify_machine_license — substitui a Cloud Function Firebase
--    verifyMachineLicense. SECURITY DEFINER: só ela toca public.machines,
--    o cliente nunca acessa a tabela diretamente (sem policy nenhuma nela).
--
--    Retorna jsonb:
--      { ok: true,  machines: n }
--      { ok: false, code: "plan_expired" | "machine_limit" | "machine_disabled",
--        machines: [...], max_machines: n }
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.verify_machine_license(
  p_machine_hash text,
  p_machine_name text,
  p_os text,
  p_plugin_ver text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_license record;
  v_now timestamptz := now();
  v_current_count int;
  v_already_registered boolean;
  v_machines jsonb;
begin
  select id, role into v_user_id, v_role
  from public.users
  where external_id = auth.uid()::text;

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'user_not_found');
  end if;

  -- Admin/master: sem checagem de máquina (mesmo comportamento do Ruby antigo).
  if v_role in ('admin', 'master') then
    return jsonb_build_object('ok', true, 'machines', 0);
  end if;

  select * into v_license from public.licenses where user_id = v_user_id;

  if v_license is null or v_license.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'plan_expired');
  end if;

  if v_license.expires_at is not null and v_license.expires_at < v_now then
    return jsonb_build_object('ok', false, 'code', 'plan_expired');
  end if;

  select exists(
    select 1 from public.machines
    where user_id = v_user_id and machine_hash = p_machine_hash
  ) into v_already_registered;

  if v_already_registered then
    -- Máquina já conhecida: bloqueia se foi desabilitada; senão atualiza last_seen.
    if exists(
      select 1 from public.machines
      where user_id = v_user_id and machine_hash = p_machine_hash and status = 'disabled'
    ) then
      return jsonb_build_object('ok', false, 'code', 'machine_disabled');
    end if;

    update public.machines
    set machine_name = coalesce(p_machine_name, machine_name),
        os = coalesce(p_os, os),
        plugin_version = coalesce(p_plugin_ver, plugin_version),
        last_seen_at = v_now
    where user_id = v_user_id and machine_hash = p_machine_hash;
  else
    select count(*) into v_current_count
    from public.machines
    where user_id = v_user_id and status = 'active';

    if v_current_count >= v_license.max_machines then
      select jsonb_agg(jsonb_build_object(
        'machineHash', machine_hash, 'machineName', machine_name,
        'os', os, 'lastSeenAt', last_seen_at
      )) into v_machines
      from public.machines
      where user_id = v_user_id and status = 'active';

      return jsonb_build_object(
        'ok', false, 'code', 'machine_limit',
        'machines', coalesce(v_machines, '[]'::jsonb),
        'maxMachines', v_license.max_machines
      );
    end if;

    insert into public.machines (user_id, machine_hash, machine_name, os, plugin_version, status, last_seen_at)
    values (v_user_id, p_machine_hash, p_machine_name, p_os, p_plugin_ver, 'active', v_now);
  end if;

  return jsonb_build_object('ok', true, 'machines', v_current_count + 1);
end;
$$;

revoke all on function public.verify_machine_license(text, text, text, text) from public;
grant execute on function public.verify_machine_license(text, text, text, text) to authenticated;
