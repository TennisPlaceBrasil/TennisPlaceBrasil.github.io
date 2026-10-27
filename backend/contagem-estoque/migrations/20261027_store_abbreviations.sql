begin;
alter table public.manual_portal_store_logins drop constraint manual_portal_store_logins_sigla_check;
alter table public.manual_portal_store_logins add constraint manual_portal_store_logins_sigla_check check (sigla ~ '^[A-Z]{4,5}$');
alter table public.stockcount_user_store_access drop constraint stockcount_user_store_access_sigla_fkey;
alter table public.stockcount_user_store_access add constraint stockcount_user_store_access_sigla_fkey foreign key (sigla) references public.manual_portal_store_logins(sigla) on update cascade on delete cascade;
commit;
