begin;
set local role service_role;
do $$
declare fixture_id text:='__delete_test_'||gen_random_uuid(); lease_a uuid:=gen_random_uuid(); lease_b uuid:=gen_random_uuid(); payload jsonb; mirrored bigint;
begin
 insert into public.stockcount_team_counts(id,store,meta,deleted,revision,mirrored_revision)
 values(fixture_id,'APAR','{"label":"TESTE DE EXCLUSAO","status":"FINALIZADA"}',true,2,1);
 payload:=public.stockcount_team_mirror(fixture_id,'claim',lease_a);
 if payload->>'deleted'<>'true' then raise exception 'Tombstone was not claimable'; end if;
 if public.stockcount_team_mirror(fixture_id,'claim',lease_b) is not null then raise exception 'Concurrent lease accepted'; end if;
 perform public.stockcount_team_mirror(fixture_id,'complete',lease_b,2,null);
 select mirrored_revision into mirrored from public.stockcount_team_counts where id=fixture_id;
 if mirrored<>1 then raise exception 'Foreign lease completed'; end if;
 perform public.stockcount_team_mirror(fixture_id,'complete',lease_a,2,'Drive indisponivel');
 select mirrored_revision into mirrored from public.stockcount_team_counts where id=fixture_id;
 if mirrored<>1 then raise exception 'Failed deletion falsely acknowledged'; end if;
 payload:=public.stockcount_team_pending_mirrors(array['APAR'],10);
 if not exists(select 1 from jsonb_array_elements(payload) x where x->>'id'=fixture_id) then raise exception 'Failed deletion not queued'; end if;
 payload:=public.stockcount_team_pending_mirrors(array['JOIN'],10);
 if exists(select 1 from jsonb_array_elements(payload) x where x->>'id'=fixture_id) then raise exception 'Queue crossed store scope'; end if;
 payload:=public.stockcount_team_mirror(fixture_id,'claim',lease_b);
 perform public.stockcount_team_mirror(fixture_id,'complete',lease_b,2,null);
 select mirrored_revision into mirrored from public.stockcount_team_counts where id=fixture_id;
 if mirrored<>2 then raise exception 'Confirmed deletion not acknowledged'; end if;
 if has_function_privilege('anon','public.stockcount_team_pending_mirrors(text[],integer)','execute') or has_function_privilege('authenticated','public.stockcount_team_pending_mirrors(text[],integer)','execute') then raise exception 'Private queue exposed'; end if;
end $$;
rollback;