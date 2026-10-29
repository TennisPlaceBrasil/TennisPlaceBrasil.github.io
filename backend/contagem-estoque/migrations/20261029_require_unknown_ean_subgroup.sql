-- Preserve old unknown EAN records without inventing a product classification.
-- These rows are visibly marked for review; new launches must provide a subgroup.
create or replace function public.stockcount_fill_legacy_subgroup(p_rows jsonb)
returns jsonb language sql immutable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(
   case when coalesce((r.value->>'unknown')::boolean,false)
      and coalesce(nullif(btrim(r.value->>'subgroup'),''),'')=''
    then r.value||jsonb_build_object('subgroup','PENDENTE DE CLASSIFICAÇÃO')
    else r.value end order by r.ordinality
 ),'[]'::jsonb)
 from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) with ordinality r(value,ordinality);
$$;

with changed_people as (
 update public.stockcount_team_people p
 set state=jsonb_set(
   jsonb_set(p.state,'{counts}',public.stockcount_fill_legacy_subgroup(p.state->'counts'),true),
   '{defects}',public.stockcount_fill_legacy_subgroup(p.state->'defects'),true),
   version=p.version+1,updated_at=clock_timestamp()
 where p.state is distinct from jsonb_set(
   jsonb_set(p.state,'{counts}',public.stockcount_fill_legacy_subgroup(p.state->'counts'),true),
   '{defects}',public.stockcount_fill_legacy_subgroup(p.state->'defects'),true)
 returning p.count_id
), normalized_counts_base as (
 select c.id,
  case when c.meta ? 'adjustedCounts' then jsonb_set(c.meta,'{adjustedCounts}',public.stockcount_fill_legacy_subgroup(c.meta->'adjustedCounts'),true) else c.meta end as meta_counts
 from public.stockcount_team_counts c
), normalized_counts as (
 select id,case when meta_counts ? 'adjustedDefects' then jsonb_set(meta_counts,'{adjustedDefects}',public.stockcount_fill_legacy_subgroup(meta_counts->'adjustedDefects'),true) else meta_counts end as meta
 from normalized_counts_base
)
update public.stockcount_team_counts c
set meta=n.meta,revision=c.revision+1,updated_at=clock_timestamp()
from normalized_counts n
where n.id=c.id and (n.meta is distinct from c.meta or c.id in (select count_id from changed_people));

create or replace function public.stockcount_check_unknown_subgroups()
returns trigger language plpgsql security invoker set search_path=public as $$
declare k text; r jsonb;
begin
 foreach k in array array['counts','defects'] loop
  for r in select value from jsonb_array_elements(coalesce(new.state->k,'[]'::jsonb)) loop
   if coalesce((r->>'unknown')::boolean,false) and coalesce(nullif(btrim(r->>'subgroup'),''),'')='' then
    raise exception 'SUBGRUPO obrigatório para EAN não cadastrado: %',r->>'ean';
   end if;
  end loop;
 end loop;
 return new;
end;
$$;
drop trigger if exists stockcount_team_unknown_subgroup_required on public.stockcount_team_people;
create trigger stockcount_team_unknown_subgroup_required before insert or update of state on public.stockcount_team_people
for each row execute function public.stockcount_check_unknown_subgroups();

revoke all on function public.stockcount_fill_legacy_subgroup(jsonb) from public,anon,authenticated;
revoke all on function public.stockcount_check_unknown_subgroups() from public,anon,authenticated;
grant execute on function public.stockcount_check_unknown_subgroups() to service_role;
