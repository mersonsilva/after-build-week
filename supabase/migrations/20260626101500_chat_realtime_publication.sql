alter table public.mensagens replica identity full;
alter table public.acenos replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mensagens'
  ) then
    alter publication supabase_realtime add table public.mensagens;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'acenos'
  ) then
    alter publication supabase_realtime add table public.acenos;
  end if;
end $$;

notify pgrst, 'reload schema';
