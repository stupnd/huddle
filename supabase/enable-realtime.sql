-- Adds Huddle's tables to the supabase_realtime publication.
-- Safe to run more than once: it skips tables that are already published.
do $$
declare t text;
begin
  foreach t in array array['trips','participants','messages','preferences','decisions','agents','speak_candidates']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Should list all seven tables.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
