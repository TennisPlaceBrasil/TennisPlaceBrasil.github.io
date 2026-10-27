-- ADM-only per-responsible actions for collaborative stock counts.
-- Incrementing participant versions invalidates stale offline submissions without deleting local drafts.
create or replace function public.stockcount_team_manage_participant(
  p_count_id text,
  p_person uuid,
  p_user uuid,
  p_action text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count public.stockcount_team_counts%rowtype;
  v_person public.stockcount_team_people%rowtype;
begin
  if p_action not in ('finish', 'clear') then
    raise exception 'Ação do responsável inválida.';
  end if;

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

  select *
  into v_count
  from public.stockcount_team_counts
  where id = p_count_id
  for update;

  if not found or v_count.deleted then
    raise exception 'Esta contagem não está disponível.';
  end if;
  if v_count.meta->>'deleteStatus' = 'PENDENTE' then
    raise exception 'Resolva o pedido de exclusão antes de alterar responsáveis.';
  end if;

  select *
  into v_person
  from public.stockcount_team_people
  where count_id = p_count_id
    and id = p_person
  for update;

  if not found then
    raise exception 'Responsável não encontrado nesta contagem.';
  end if;

  if p_action = 'finish' then
    update public.stockcount_team_people
    set done = true,
        version = version + 1,
        last_request = null,
        last_payload = null,
        updated_at = clock_timestamp()
    where count_id = p_count_id
      and id = p_person;

    update public.stockcount_team_counts
    set meta = jsonb_set(
          meta,
          '{status}',
          to_jsonb(
            case
              when not exists (
                select 1
                from public.stockcount_team_people
                where count_id = p_count_id
                  and not done
              ) then 'FINALIZADA'::text
              else 'EM ANDAMENTO'::text
            end
          )
        ),
        revision = revision + 1,
        mirror_error = null,
        updated_at = clock_timestamp()
    where id = p_count_id;
  else
    update public.stockcount_team_people
    set state = jsonb_build_object('counts', '[]'::jsonb, 'defects', '[]'::jsonb),
        done = false,
        version = version + 1,
        last_request = null,
        last_payload = null,
        updated_at = clock_timestamp()
    where count_id = p_count_id
      and id = p_person;

    update public.stockcount_team_counts
    set meta = (meta - 'adjustedCounts' - 'adjustedDefects')
          || jsonb_build_object('status', 'EM ANDAMENTO'),
        revision = revision + 1,
        mirror_error = null,
        updated_at = clock_timestamp()
    where id = p_count_id;
  end if;

  return public.stockcount_team_snapshot(p_count_id, null);
end;
$$;

revoke all on function public.stockcount_team_manage_participant(text, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.stockcount_team_manage_participant(text, uuid, uuid, text)
to service_role;

-- Include participant IDs in the ADM-visible snapshot so actions target one device/person.
create or replace function public.stockcount_team_snapshot(
  p_id text,
  p_person uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select
    (c.meta - 'adjustedCounts' - 'adjustedDefects')
    || jsonb_build_object(
      'id', c.id,
      'store', c.store,
      'collaborative', true,
      'version', c.revision,
      'updatedAt', c.updated_at,
      'mirroredVersion', c.mirrored_revision,
      'mirrorError', c.mirror_error,
      'counts',
        case
          when p_person is null
            then coalesce(c.meta->'adjustedCounts', public.stockcount_team_rows(c.id, 'counts'))
          else coalesce(p.state->'counts', '[]'::jsonb)
        end,
      'defects',
        case
          when p_person is null
            then coalesce(c.meta->'adjustedDefects', public.stockcount_team_rows(c.id, 'defects'))
          else coalesce(p.state->'defects', '[]'::jsonb)
        end,
      'finalTotals',
        case
          when c.meta ? 'adjustedCounts'
            then jsonb_build_object('counts', c.meta->'adjustedCounts', 'defects', c.meta->'adjustedDefects')
          else null
        end,
      'peers',
        case
          when p_person is null then null
          else jsonb_build_object(
            'counts', public.stockcount_team_rows(c.id, 'counts', p_person),
            'defects', public.stockcount_team_rows(c.id, 'defects', p_person)
          )
        end,
      'participantId', p.id,
      'participantVersion', p.version,
      'responsible', p.responsible,
      'participantDone', coalesce(p.done, false),
      'collabViewOnly', p_person is null,
      'participants',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', x.id,
                'responsible', x.responsible,
                'done', x.done,
                'updatedAt', x.updated_at,
                'device', x.audit->>'device',
                'ip', x.audit->>'ip',
                'units', (
                  select coalesce(sum((r->>'quantity')::bigint), 0)
                  from jsonb_array_elements(coalesce(x.state->'counts', '[]'::jsonb)) r
                ),
                'defects', (
                  select coalesce(sum((r->>'quantity')::bigint), 0)
                  from jsonb_array_elements(coalesce(x.state->'defects', '[]'::jsonb)) r
                )
              )
              order by x.updated_at
            )
            from public.stockcount_team_people x
            where x.count_id = c.id
          ),
          '[]'::jsonb
        )
    )
  from public.stockcount_team_counts c
  left join public.stockcount_team_people p
    on p.count_id = c.id
   and p.id = p_person
  where c.id = p_id
    and not c.deleted;
$$;
