create table public.manual_portal_resources (
 portal text not null check(portal in ('adm','loja','franqueado')),
 resource text not null check(resource='shell' or resource ~ '^manual_[0-9]+[.]html$'),
 revision text not null check(revision ~ '^[a-f0-9]{64}$'),
 parts integer not null check(parts>0), bytes integer not null check(bytes>0),
 primary key(portal,resource), unique(portal,resource,revision)
);
create table public.manual_portal_resource_chunks (
 portal text not null, resource text not null, revision text not null,
 part integer not null check(part>=0), html text not null,
 primary key(portal,resource,revision,part),
 foreign key(portal,resource,revision) references public.manual_portal_resources(portal,resource,revision) on delete cascade
);
alter table public.manual_portal_resources enable row level security;
alter table public.manual_portal_resource_chunks enable row level security;
revoke all on public.manual_portal_resources,public.manual_portal_resource_chunks from public,anon,authenticated;
grant select on public.manual_portal_resources,public.manual_portal_resource_chunks to authenticated;
grant all on public.manual_portal_resources,public.manual_portal_resource_chunks to service_role;
create policy manual_resource_access on public.manual_portal_resources for select to authenticated using (
 exists(select 1 from public.manual_portal_members m where m.user_id=(select auth.uid()) and m.active and ('adm'=any(m.profiles) or manual_portal_resources.portal=any(m.profiles)))
);
create policy manual_resource_chunk_access on public.manual_portal_resource_chunks for select to authenticated using (
 exists(select 1 from public.manual_portal_members m where m.user_id=(select auth.uid()) and m.active and ('adm'=any(m.profiles) or manual_portal_resource_chunks.portal=any(m.profiles)))
);

create function public.manual_portal_load_resource(requested_portal text, requested_resource text, known_revision text default null)
returns table(revision text,bytes integer,html text)
language sql stable security invoker set search_path='' as $$
 select r.revision,r.bytes,
 case when known_revision=r.revision then null::text else
 (select string_agg(c.html,'' order by c.part) from public.manual_portal_resource_chunks c
 where c.portal=r.portal and c.resource=r.resource and c.revision=r.revision
 having count(*)=r.parts and min(c.part)=0 and max(c.part)=r.parts-1)
 end
 from public.manual_portal_resources r
 where r.portal=requested_portal and r.resource=requested_resource;
$$;
revoke all on function public.manual_portal_load_resource(text,text,text) from public,anon;
grant execute on function public.manual_portal_load_resource(text,text,text) to authenticated;