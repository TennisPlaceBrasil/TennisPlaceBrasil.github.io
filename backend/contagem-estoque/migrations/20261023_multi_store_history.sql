-- Explicit, additive store grants for multi-store count visibility. Existing login mappings remain valid.
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

create or replace function public.stockcount_team(p_action text,p_user uuid,p_id text default null,p_person uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.stockcount_team_counts%rowtype; p public.stockcount_team_people%rowtype; adm boolean; st text; nm text; k text; r jsonb; req text; payload jsonb; n integer; lease uuid;
begin
 if not exists(select 1 from public.manual_portal_members where user_id=p_user and active) then raise exception 'Acesso inativo.'; end if;
 adm:=p_user in ('adb6a08e-1a28-4b41-8dde-addd9c06f915'::uuid,'42eb08bc-5fa7-4d74-8be5-cbe5c909ef30'::uuid);
 select sigla into st from public.manual_portal_store_logins where user_id=p_user;
 if p_action='find' then
  select count_id into p_id from public.stockcount_team_people where id=p_person and user_id=p_user;
  if p_id is null then return null; end if;
 if not adm and not exists(select 1 from public.stockcount_team_counts c where c.id=p_id and not c.deleted and (exists(select 1 from public.manual_portal_store_logins m where m.user_id=p_user and m.sigla=c.store) or exists(select 1 from public.stockcount_user_store_access a where a.user_id=p_user and a.sigla=c.store))) then raise exception 'Contagem sem permissão.'; end if;
  return public.stockcount_team_snapshot(p_id,p_person);
 end if;
 if p_action='list' then
  return (select coalesce(jsonb_agg((meta-'adjustedCounts'-'adjustedDefects')||jsonb_build_object('id',id,'collaborative',true,'version',revision,'updatedAt',updated_at) order by updated_at desc),'[]')
   from public.stockcount_team_counts c where not deleted and (adm or exists(select 1 from public.manual_portal_store_logins m where m.user_id=p_user and m.sigla=c.store) or exists(select 1 from public.stockcount_user_store_access a where a.user_id=p_user and a.sigla=c.store)) and (p_payload->>'store' is null or store=p_payload->>'store')
    and (coalesce((p_payload->>'history')::boolean,false) or meta->>'status'<>'FINALIZADA'));
 end if;
 if p_action='init' then
  if not adm and not exists(select 1 from public.manual_portal_store_logins where user_id=p_user and sigla=p_payload->>'store') and not exists(select 1 from public.stockcount_user_store_access where user_id=p_user and sigla=p_payload->>'store') then raise exception 'Contagem sem permissão.'; end if;
  insert into public.stockcount_team_counts(id,store,meta) values(p_id,p_payload->>'store',p_payload-'counts'-'defects'-'auditSession'-'responsible') on conflict do nothing;
 end if;
 select * into c from public.stockcount_team_counts where id=p_id for update;
 if not found or (not adm and not exists(select 1 from public.manual_portal_store_logins where user_id=p_user and sigla=c.store) and not exists(select 1 from public.stockcount_user_store_access where user_id=p_user and sigla=c.store)) then raise exception 'Contagem sem permissão.'; end if;
 if c.deleted then raise exception 'Esta contagem já não existe.'; end if;
 if p_action in ('init','join') then
  nm:=btrim(p_payload->>'responsible');
  if nm is null or nm !~ '^[[:alpha:] ]+$' or length(replace(nm,' ',''))<4 or length(nm)>80 then raise exception 'RESPONSÁVEL: informe pelo menos 4 letras, sem números.'; end if;
  if p_person is null then raise exception 'Identificação deste dispositivo ausente.'; end if;
  select * into p from public.stockcount_team_people where count_id=p_id and id=p_person;
  if found then
   if p.user_id<>p_user or p.responsible<>nm then raise exception 'CONFLICT: responsável diferente do cadastro deste dispositivo.'; end if;
  else
   if c.meta->>'status'='FINALIZADA' or c.meta->>'deleteStatus'='PENDENTE' then raise exception 'Esta contagem está bloqueada ou finalizada.'; end if;
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
  if p.done or c.meta->>'status'='FINALIZADA' or c.meta->>'deleteStatus'='PENDENTE' then raise exception 'Participação encerrada ou contagem bloqueada. Dados locais preservados.'; end if;
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
  if not adm or c.meta->>'deleteStatus' is distinct from 'PENDENTE' then raise exception 'Aprovação sem permissão.'; end if;
  if (p_payload->>'reviewVersion')::bigint is distinct from c.revision then raise exception 'Reabra os produtos antes de aprovar.'; end if;
  update public.stockcount_team_counts set deleted=coalesce((p_payload->>'approve')::boolean,false),meta=meta||jsonb_build_object('deleteStatus',case when (p_payload->>'approve')::boolean then 'APROVADA' else 'RECUSADA' end,'deleteReviewedBy',p_user,'deleteReviewedAt',now(),'deleteReason',left(p_payload->>'reason',200)),revision=revision+1,updated_at=now() where id=p_id;
  if (p_payload->>'approve')::boolean then return jsonb_build_object('id',p_id,'deleted',true); end if;
 elsif p_action='delete' then
  if not adm then raise exception 'Exclusão restrita ao ADM.'; end if;
  if exists(select 1 from public.stockcount_team_people where count_id=p_id and not done) then raise exception 'Aguarde todos os responsáveis finalizarem antes de excluir.'; end if;
  update public.stockcount_team_counts set deleted=true,revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('id',p_id,'deleted',true);
 elsif p_action='adjustRecount' then
  if not adm and not exists(select 1 from public.manual_portal_store_logins where user_id=p_user and sigla=c.store) and not exists(select 1 from public.stockcount_user_store_access where user_id=p_user and sigla=c.store) then raise exception 'Recontagem sem permissão.'; end if;
  if c.meta->>'status'<>'FINALIZADA' then raise exception 'A contagem ainda não foi finalizada.'; end if;
  update public.stockcount_team_counts set meta=meta||jsonb_build_object('adjustedCounts',p_payload->'counts','adjustedDefects',p_payload->'defects'),revision=revision+1,mirrored_revision=revision+1,updated_at=now() where id=p_id;
 else raise exception 'Ação colaborativa inválida.';
 end if;
 return public.stockcount_team_snapshot(p_id,p_person);
end;
$$;
