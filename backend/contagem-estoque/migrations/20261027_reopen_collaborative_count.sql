create or replace function public.stockcount_team_reopen(p_id text, p_user uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count public.stockcount_team_counts%rowtype;
begin
  if not exists (
    select 1
    from public.manual_portal_members m
    where m.user_id = p_user
      and m.active
      and (
        p_user in (
          'adb6a08e-1a28-4b41-8dde-addd9c06f915'::uuid,
          '42eb08bc-5fa7-4d74-8be5-cbe5c909ef30'::uuid
        )
        or m.profiles @> array['adm']::text[]
      )
  ) then
    raise exception 'Ação restrita aos administradores.';
  end if;

  select * into v_count
  from public.stockcount_team_counts
  where id = p_id
  for update;

  if not found or v_count.deleted then
    raise exception 'Esta contagem não está disponível.';
  end if;
  if v_count.meta->>'status' <> 'FINALIZADA' then
    raise exception 'Somente contagens finalizadas podem ser reabertas.';
  end if;
  if v_count.meta->>'deleteStatus' = 'PENDENTE' then
    raise exception 'Resolva o pedido de exclusão antes de reabrir.';
  end if;

  update public.stockcount_team_people
  set done = false,
      version = version + 1,
      last_request = null,
      last_payload = null,
      updated_at = clock_timestamp()
  where count_id = p_id;

  update public.stockcount_team_counts
  set meta = (meta - 'adjustedCounts' - 'adjustedDefects')
       || jsonb_build_object(
            'status', 'EM ANDAMENTO',
            'reopenedAt', clock_timestamp(),
            'reopenedBy', p_user
          ),
      revision = revision + 1,
      mirror_error = null,
      updated_at = clock_timestamp()
  where id = p_id;

  return public.stockcount_team_snapshot(p_id, null);
end;
$$;

revoke all on function public.stockcount_team_reopen(text, uuid)
from public, anon, authenticated;
grant execute on function public.stockcount_team_reopen(text, uuid)
to service_role;
