-- Collaborative live records; Sheets is a retryable projection. No client table/RPC access.
create table if not exists public.stockcount_team_counts (
 id text primary key, store text not null, meta jsonb not null,
 revision bigint not null default 0, mirrored_revision bigint not null default -1,
 mirror_lease_until timestamptz, mirror_lease uuid, mirror_error text,
 deleted boolean not null default false, updated_at timestamptz not null default now()
);
create table if not exists public.stockcount_team_people (
 count_id text not null references public.stockcount_team_counts(id), id uuid not null,
 user_id uuid not null references auth.users(id), responsible text not null,
 version bigint not null default 0, done boolean not null default false,
 state jsonb not null default '{"counts":[],"defects":[]}',
 audit jsonb not null default '{}', last_request text, last_payload jsonb,
 updated_at timestamptz not null default now(), primary key(count_id,id)
);
create unique index if not exists stockcount_team_person_id on public.stockcount_team_people(id);
create table if not exists public.stockcount_user_store_access (
 user_id uuid not null references auth.users(id) on delete cascade,
 sigla text not null references public.manual_portal_store_logins(sigla) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,sigla)
);
insert into public.stockcount_user_store_access(user_id,sigla)
 select user_id,sigla from public.manual_portal_store_logins on conflict do nothing;
alter table public.stockcount_user_store_access enable row level security;
revoke all on public.stockcount_user_store_access from public,anon,authenticated;
grant all on public.stockcount_user_store_access to service_role;
alter table public.stockcount_team_counts enable row level security;
alter table public.stockcount_team_people enable row level security;
revoke all on public.stockcount_team_counts,public.stockcount_team_people from public,anon,authenticated;
grant all on public.stockcount_team_counts,public.stockcount_team_people to service_role;

create or replace function public.stockcount_team_rows(p_id text,p_kind text,p_exclude uuid default null)
returns jsonb language sql stable security invoker set search_path=public as $$
 with expanded as (
  select r.value as item,r.ordinality as pos,p.updated_at,p.responsible,p.id
  from public.stockcount_team_people p cross join lateral jsonb_array_elements(p.state->p_kind) with ordinality r(value,ordinality)
  where p.count_id=p_id and (p_exclude is null or p.id<>p_exclude)
 ), grouped as (
  select item->>'ean' as ean,sum((item->>'quantity')::bigint) as quantity,
   (array_agg(item order by coalesce(item->>'lastScannedAt','') desc,updated_at desc))[1] as latest,
   string_agg(distinct responsible,', ' order by responsible) as names,min(updated_at) as first_seen,min(pos) as pos
  from expanded group by item->>'ean'
 ) select coalesce(jsonb_agg(latest||jsonb_build_object('quantity',quantity,'responsible',names) order by first_seen,pos,ean),'[]') from grouped;
$$;
create or replace function public.stockcount_team_snapshot(p_id text,p_person uuid default null)
returns jsonb language sql stable security invoker set search_path=public as $$
 select (c.meta-'adjustedCounts'-'adjustedDefects')||jsonb_build_object('id',c.id,'store',c.store,'collaborative',true,
 'version',c.revision,'updatedAt',c.updated_at,'mirroredVersion',c.mirrored_revision,'mirrorError',c.mirror_error,
 'counts',case when p_person is null then coalesce(c.meta->'adjustedCounts',public.stockcount_team_rows(c.id,'counts')) else coalesce(p.state->'counts','[]') end,
 'defects',case when p_person is null then coalesce(c.meta->'adjustedDefects',public.stockcount_team_rows(c.id,'defects')) else coalesce(p.state->'defects','[]') end,
 'finalTotals',case when c.meta ? 'adjustedCounts' then jsonb_build_object('counts',c.meta->'adjustedCounts','defects',c.meta->'adjustedDefects') else null end,
 'peers',case when p_person is null then null else jsonb_build_object('counts',public.stockcount_team_rows(c.id,'counts',p_person),'defects',public.stockcount_team_rows(c.id,'defects',p_person)) end,
 'participantId',p.id,'participantVersion',p.version,'responsible',p.responsible,'participantDone',coalesce(p.done,false),'collabViewOnly',p_person is null,
 'participants',coalesce((select jsonb_agg(jsonb_build_object('responsible',x.responsible,'done',x.done,'updatedAt',x.updated_at,
 'device',x.audit->>'device','ip',x.audit->>'ip',
 'units',(select coalesce(sum((r->>'quantity')::bigint),0) from jsonb_array_elements(x.state->'counts') r),
 'defects',(select coalesce(sum((r->>'quantity')::bigint),0) from jsonb_array_elements(x.state->'defects') r)) order by x.updated_at)
 from public.stockcount_team_people x where x.count_id=c.id),'[]'))
 from public.stockcount_team_counts c left join public.stockcount_team_people p on p.count_id=c.id and p.id=p_person where c.id=p_id and not c.deleted;
$$;

create or replace function public.stockcount_team_share_people(p_id text)
returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('responsible',p.responsible,'done',p.done,'updatedAt',p.updated_at,
  'device',p.audit->>'device','ip',p.audit->>'ip','counts',coalesce(p.state->'counts','[]'),'defects',coalesce(p.state->'defects','[]')) order by p.updated_at,p.responsible),'[]')
 from public.stockcount_team_people p join public.stockcount_team_counts c on c.id=p.count_id
 where p.count_id=p_id and not c.deleted;
$$;

create or replace function public.stockcount_team(p_action text,p_user uuid,p_id text default null,p_person uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_count public.stockcount_team_counts%rowtype; p public.stockcount_team_people%rowtype; adm boolean; st text; nm text; k text; r jsonb; req text; payload jsonb; n integer; lease uuid;
begin
 if not exists(select 1 from public.manual_portal_members where user_id=p_user and active) then raise exception 'Acesso inativo.'; end if;
 adm:=p_user in ('adb6a08e-1a28-4b41-8dde-addd9c06f915'::uuid,'42eb08bc-5fa7-4d74-8be5-cbe5c909ef30'::uuid);
 select sigla into st from public.manual_portal_store_logins where user_id=p_user;
 if p_action='find' then
  select count_id into p_id from public.stockcount_team_people where id=p_person and user_id=p_user;
  if p_id is null then return null; end if;
 if not adm and not exists(select 1 from public.stockcount_team_counts scoped_count where scoped_count.id=p_id and not scoped_count.deleted and (exists(select 1 from public.manual_portal_store_logins m where m.user_id=p_user and m.sigla=scoped_count.store) or exists(select 1 from public.stockcount_user_store_access a where a.user_id=p_user and a.sigla=scoped_count.store))) then raise exception 'Contagem sem permissão.'; end if;
  return public.stockcount_team_snapshot(p_id,p_person);
 end if;
 if p_action='list' then
  return (select coalesce(jsonb_agg((sc.meta-'adjustedCounts'-'adjustedDefects')||jsonb_build_object('id',sc.id,'collaborative',true,'version',sc.revision,'updatedAt',sc.updated_at) order by sc.updated_at desc),'[]')
   from public.stockcount_team_counts sc where not sc.deleted and (adm or exists(select 1 from public.manual_portal_store_logins m where m.user_id=p_user and m.sigla=sc.store) or exists(select 1 from public.stockcount_user_store_access a where a.user_id=p_user and a.sigla=sc.store)) and (p_payload->>'store' is null or sc.store=p_payload->>'store')
    and (coalesce((p_payload->>'history')::boolean,false) or sc.meta->>'status'<>'FINALIZADA')
    and (adm or sc.meta->>'deleteStatus' is distinct from 'PENDENTE'));
 end if;
 if p_action='init' then
  if not adm and not exists(select 1 from public.manual_portal_store_logins where user_id=p_user and sigla=p_payload->>'store') and not exists(select 1 from public.stockcount_user_store_access where user_id=p_user and sigla=p_payload->>'store') then raise exception 'Contagem sem permissão.'; end if;
  insert into public.stockcount_team_counts(id,store,meta) values(p_id,p_payload->>'store',p_payload-'counts'-'defects'-'auditSession'-'responsible') on conflict do nothing;
 end if;
 select * into v_count from public.stockcount_team_counts where id=p_id for update;
 if not found or (not adm and not exists(select 1 from public.manual_portal_store_logins where user_id=p_user and sigla=v_count.store) and not exists(select 1 from public.stockcount_user_store_access where user_id=p_user and sigla=v_count.store)) then raise exception 'Contagem sem permissão.'; end if;
 if v_count.deleted then raise exception 'Esta contagem já não existe.'; end if;
 if p_action in ('init','join') then
  nm:=btrim(p_payload->>'responsible');
  if nm is null or nm !~ '^[[:alpha:] ]+$' or length(replace(nm,' ',''))<4 or length(nm)>80 then raise exception 'RESPONSÁVEL: informe pelo menos 4 letras, sem números.'; end if;
  if p_person is null then raise exception 'Identificação deste dispositivo ausente.'; end if;
  select * into p from public.stockcount_team_people where count_id=p_id and id=p_person;
  if found then
   if p.user_id<>p_user or p.responsible<>nm then raise exception 'CONFLICT: responsável diferente do cadastro deste dispositivo.'; end if;
  else
   if v_count.meta->>'status'='FINALIZADA' or v_count.meta->>'deleteStatus'='PENDENTE' then raise exception 'Esta contagem está bloqueada ou finalizada.'; end if;
   insert into public.stockcount_team_people(count_id,id,user_id,responsible,audit) values(p_id,p_person,p_user,nm,coalesce(p_payload->'auditSession','{}'));
  end if;
 elsif p_action='read' then
  if p_person is not null and not exists(select 1 from public.stockcount_team_people where count_id=p_id and id=p_person and user_id=p_user) then raise exception 'Participação sem permissão.'; end if;
 elsif p_action in ('save','finish') then
  select * into p from public.stockcount_team_people where count_id=p_id and id=p_person and user_id=p_user;
  if not found then raise exception 'Reabra a participação deste responsável antes de lançar.'; end if;
  req:=p_payload->>'requestId';payload:=jsonb_build_object('sha256',encode(extensions.digest((p_payload-'auditSession')::text||p_action,'sha256'),'hex'));
  if req is null or length(req)<16 or length(req)>100 then raise exception 'Identificador de envio inválido.'; end if;
  if p.last_request=req then
   if p.last_payload is distinct from payload then raise exception 'CONFLICT: o mesmo envio contém dados diferentes.'; end if;
   return public.stockcount_team_snapshot(p_id,p_person);
  end if;
  if p.done or v_count.meta->>'status'='FINALIZADA' or v_count.meta->>'deleteStatus'='PENDENTE' then raise exception 'Participação encerrada ou contagem bloqueada. Dados locais preservados.'; end if;
  if (p_payload->>'participantVersion')::bigint is distinct from p.version then raise exception 'CONFLICT: esta participação foi alterada em outra aba. Exporte a cópia local.'; end if;
  foreach k in array array['counts','defects'] loop
   if jsonb_typeof(p_payload->k) is distinct from 'array' or jsonb_array_length(p_payload->k)>40000 then raise exception 'Lista de produtos inválida.'; end if;
   for r in select value from jsonb_array_elements(p_payload->k) loop
    if coalesce(r->>'ean','') !~ '^\d{1,30}$' or coalesce(r->>'quantity','') !~ '^\d+$' or (r->>'quantity')::numeric not between 1 and 1000000
     or coalesce(length(btrim(r->>'description')),0) not between 1 and 180 or coalesce(length(btrim(r->>'brand')),0) not between 1 and 80 then raise exception 'EAN, quantidade, produto ou marca inválidos.'; end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(p_payload->k) a group by a->>'ean' having count(*)>1) then raise exception 'EAN repetido no mesmo envio.'; end if;
  end loop;
  update public.stockcount_team_people set state=jsonb_build_object('counts',p_payload->'counts','defects',p_payload->'defects'),
   version=version+1,done=p_action='finish',last_request=req,last_payload=payload,audit=coalesce(p_payload->'auditSession',audit),updated_at=clock_timestamp()
   where count_id=p_id and id=p_person;
  if exists(select 1 from jsonb_array_elements(public.stockcount_team_rows(p_id,'counts')||public.stockcount_team_rows(p_id,'defects')) a where (a->>'quantity')::bigint>1000000) then raise exception 'Total de um EAN ultrapassa 1.000.000.'; end if;
  update public.stockcount_team_counts set revision=revision+1,updated_at=clock_timestamp(),meta=jsonb_set(meta,'{status}',to_jsonb(case when not exists(select 1 from public.stockcount_team_people where count_id=p_id and not done) then 'FINALIZADA'::text else 'EM ANDAMENTO'::text end)) where id=p_id;
 elsif p_action='requestDelete' then
  if exists(select 1 from public.stockcount_team_people where count_id=p_id and id is distinct from p_person and not done) then raise exception 'Aguarde os outros responsáveis finalizarem antes de solicitar exclusão.'; end if;
  update public.stockcount_team_counts set meta=meta||jsonb_build_object('deleteStatus','PENDENTE','deleteRequestedAt',now(),'deleteRequestedBy',p_user),revision=revision+1,updated_at=now() where id=p_id;
 elsif p_action='resolveDelete' then
  if not adm or v_count.meta->>'deleteStatus' is distinct from 'PENDENTE' then raise exception 'Aprovação sem permissão.'; end if;
  if (p_payload->>'reviewVersion')::bigint is distinct from v_count.revision then raise exception 'Reabra os produtos antes de aprovar.'; end if;
  update public.stockcount_team_counts set deleted=coalesce((p_payload->>'approve')::boolean,false),meta=meta||jsonb_build_object('deleteStatus',case when (p_payload->>'approve')::boolean then 'APROVADA' else 'RECUSADA' end,'deleteReviewedBy',p_user,'deleteReviewedAt',now(),'deleteReason',left(p_payload->>'reason',200)),revision=revision+1,updated_at=now() where id=p_id;
  if (p_payload->>'approve')::boolean then return jsonb_build_object('id',p_id,'deleted',true); end if;
 elsif p_action='delete' then
  if not adm then raise exception 'Exclusão restrita ao ADM.'; end if;
  if exists(select 1 from public.stockcount_team_people where count_id=p_id and not done) then raise exception 'Aguarde todos os responsáveis finalizarem antes de excluir.'; end if;
  update public.stockcount_team_counts set deleted=true,revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('id',p_id,'deleted',true);
 elsif p_action='adjustRecount' then
  if not adm and not exists(select 1 from public.manual_portal_store_logins where user_id=p_user and sigla=v_count.store) and not exists(select 1 from public.stockcount_user_store_access where user_id=p_user and sigla=v_count.store) then raise exception 'Recontagem sem permissão.'; end if;
  if v_count.meta->>'status'<>'FINALIZADA' then raise exception 'A contagem ainda não foi finalizada.'; end if;
  update public.stockcount_team_counts set meta=meta||jsonb_build_object('adjustedCounts',p_payload->'counts','adjustedDefects',p_payload->'defects'),revision=revision+1,mirrored_revision=revision+1,updated_at=now() where id=p_id;
 else raise exception 'Ação colaborativa inválida.';
 end if;
 return public.stockcount_team_snapshot(p_id,p_person);
end;
$$;

-- Lease + revision guards serialize the Sheets projection without holding a database lock over HTTP.
create or replace function public.stockcount_team_mirror(p_id text,p_action text,p_lease uuid,p_revision bigint default null,p_error text default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.stockcount_team_counts%rowtype;
begin
 select * into c from public.stockcount_team_counts where id=p_id for update;
 if not found then return null; end if;
 if p_action='claim' then
  if c.deleted or c.mirrored_revision>=c.revision or c.mirror_lease_until>now() then return null; end if;
  update public.stockcount_team_counts set mirror_lease=p_lease,mirror_lease_until=now()+interval '5 minutes' where id=p_id;
  return public.stockcount_team_snapshot(p_id);
 end if;
 if c.mirror_lease is distinct from p_lease then return null; end if;
 update public.stockcount_team_counts set mirrored_revision=case when p_error is null then greatest(mirrored_revision,p_revision) else mirrored_revision end,
  mirror_error=left(p_error,300),mirror_lease=null,mirror_lease_until=null where id=p_id;
 return null;
end;
$$;
revoke all on function public.stockcount_team_rows(text,text,uuid),public.stockcount_team_snapshot(text,uuid),public.stockcount_team(text,uuid,text,uuid,jsonb),public.stockcount_team_mirror(text,text,uuid,bigint,text),public.stockcount_team_share_people(text) from public,anon,authenticated;
grant execute on function public.stockcount_team_rows(text,text,uuid),public.stockcount_team_snapshot(text,uuid),public.stockcount_team(text,uuid,text,uuid,jsonb),public.stockcount_team_mirror(text,text,uuid,bigint,text),public.stockcount_team_share_people(text) to service_role;
