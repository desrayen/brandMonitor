-- Brand Safety · Person entity: tokoh, afiliasi media (dari akun di database), konten Instagram 3 bulan, berita media online, catatan manual.
-- Reuses public.persons + public.person_accounts (created in 20261106000000_brand_safety.sql).

-- ---------- persons: extra columns ----------
alter table public.persons
  add column if not exists position text,          -- jabatan / peran (mis. "Mantan anggota DPR RI")
  add column if not exists ig_summary text,        -- ringkasan konten IG 3 bulan terakhir (manual / hasil riset)
  add column if not exists ig_checked_at date,     -- terakhir konten IG dicek
  add column if not exists news_checked_at date;   -- terakhir berita dicek
create unique index if not exists persons_full_name_uq on public.persons (lower(full_name));

-- ---------- person_accounts: more roles (afiliasi media bisa berupa komisaris, penasihat, dll.) ----------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.person_accounts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%' loop
    execute format('alter table public.person_accounts drop constraint %I', c);
  end loop;
end $$;
alter table public.person_accounts add constraint person_accounts_role_check
  check (role in ('founder','owner','management','commissioner','advisor','affiliated','other'));

-- ---------- Instagram posts of the person (window: last 3 months, filtered at read time) ----------
create table if not exists public.person_ig_posts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  post_url text not null,
  posted_at date,
  caption text,                  -- ringkasan / kutipan singkat
  theme text,                    -- mis. pemerintahan, sponsor, pribadi, lainnya
  views bigint,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (person_id, post_url)
);
create index if not exists person_ig_posts_person_idx on public.person_ig_posts (person_id, posted_at desc);

-- ---------- online news about the person ----------
create table if not exists public.person_news (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  title text not null,
  outlet text,
  url text,
  published_at date,
  tone text check (tone in ('positive','neutral','negative')),
  summary text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (person_id, url)
);
create index if not exists person_news_person_idx on public.person_news (person_id, published_at desc);

-- ---------- RLS (same pattern as the other bs_* tables) ----------
alter table public.person_ig_posts enable row level security;
alter table public.person_news enable row level security;
do $$
declare t text;
begin
  foreach t in array array['person_ig_posts','person_news'] loop
    execute format('drop policy if exists %I_member_read on public.%I', t, t);
    execute format('create policy %I_member_read on public.%I for select to authenticated using (public.is_member() and not public.is_guest())', t, t);
    execute format('drop policy if exists %I_member_write on public.%I', t, t);
    execute format('create policy %I_member_write on public.%I for insert to authenticated with check (public.is_member() and not public.is_guest())', t, t);
    execute format('drop policy if exists %I_member_update on public.%I', t, t);
    execute format('create policy %I_member_update on public.%I for update to authenticated using (public.is_member() and not public.is_guest()) with check (public.is_member() and not public.is_guest())', t, t);
    execute format('drop policy if exists %I_member_delete on public.%I', t, t);
    execute format('create policy %I_member_delete on public.%I for delete to authenticated using (public.is_member() and not public.is_guest())', t, t);
  end loop;
end $$;

-- ---------- RPC: everything the Person tab needs in one call ----------
create or replace function public.bs_person_overview(p_days int default 92)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'position', p.position, 'entity', p.entity, 'notes', p.notes,
    'ig_handle', p.ig_handle, 'x_handle', p.x_handle, 'tiktok_handle', p.tiktok_handle, 'linkedin_url', p.linkedin_url,
    'ig_summary', p.ig_summary, 'ig_checked_at', p.ig_checked_at, 'news_checked_at', p.news_checked_at, 'updated_at', p.updated_at,
    'media', (select coalesce(jsonb_agg(jsonb_build_object(
        'handle', pa.handle, 'role', pa.role, 'title', pa.title, 'source_url', pa.source_url,
        'followers', a.followers, 'status', coalesce(f.status, 'unknown'), 'content_flag', coalesce(f.content_flag, 'no_data')
      ) order by pa.role, pa.handle), '[]'::jsonb)
      from person_accounts pa
      left join accounts a on lower(a.handle) = lower(pa.handle)
      left join bs_affiliations f on lower(f.handle) = lower(pa.handle)
      where pa.person_id = p.id),
    'ig_from', (now() - make_interval(days => p_days))::date,
    'ig_posts', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'post_url', i.post_url, 'posted_at', i.posted_at, 'caption', i.caption, 'theme', i.theme, 'views', i.views, 'note', i.note
      ) order by i.posted_at desc nulls last), '[]'::jsonb)
      from person_ig_posts i where i.person_id = p.id and (i.posted_at is null or i.posted_at >= (now() - make_interval(days => p_days))::date)),
    'news', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', n.id, 'title', n.title, 'outlet', n.outlet, 'url', n.url, 'published_at', n.published_at, 'tone', n.tone, 'summary', n.summary
      ) order by n.published_at desc nulls last), '[]'::jsonb)
      from person_news n where n.person_id = p.id)
  ) order by p.full_name), '[]'::jsonb)
  from persons p
  where public.is_member() and not public.is_guest();
$$;
grant execute on function public.bs_person_overview(int) to authenticated;
