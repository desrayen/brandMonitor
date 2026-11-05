-- Brand Safety · background check of homeless-media / KOL accounts for brand clients.
-- One "case" = one request from one brand. Evidence is stored as dated, sourced items
-- (never bare conclusions) so the brand can judge for itself. Members read/write;
-- super admin deletes. Not shareable through view keys (sensitive).

create extension if not exists pgcrypto;

-- ---------- reference: evidence categories with default weights ----------
create table if not exists public.bs_categories (
  key text primary key,
  label text not null,
  description text not null,
  weight int not null default 10,           -- contribution to the 0–100 risk score
  sort int not null default 100
);
insert into public.bs_categories (key, label, description, weight, sort) values
  ('formal_position',            'Jabatan formal di pemerintahan',      'Stafsus, utusan khusus, wamen, komisaris BUMN, pejabat daerah, dsb. Harus ada Keppres/SK/berita pelantikan.', 40, 10),
  ('paid_government_content',    'Konten berbayar dari pemerintah/BUMN','Post bersponsor/kolaborasi dari kementerian, pemda, BUMN, atau program pemerintah.', 15, 20),
  ('campaign_endorsement_self',  'Deklarasi dukungan kampanye (sendiri)','Menyatakan dukungan ke paslon/partai lewat akun atau pernyataannya sendiri.', 25, 30),
  ('campaign_endorsement_claimed','Diklaim mendukung oleh pihak ketiga','Nama masuk daftar pendukung versi TKN/media, tanpa pernyataan sendiri.', 10, 40),
  ('campaign_event_attendance',  'Hadir di acara kampanye/tim pemenangan','Hadir di acara TKN, jalan sehat, makan siang bersama kandidat, dsb.', 10, 50),
  ('political_content_pattern',  'Pola konten politik',                 'Wawancara/konten yang konsisten mempromosikan tokoh atau program pemerintah.', 15, 60),
  ('ownership_link',             'Kepemilikan / badan usaha',           'Badan usaha di balik akun dimiliki tokoh politik, pejabat, atau grup media partisan.', 30, 70),
  ('network_link',               'Jaringan / keluarga / manajemen',     'Terkait keluarga, manajemen, atau grup yang sudah terafiliasi.', 10, 80),
  ('other',                      'Lainnya',                             'Bukti lain yang relevan (jelaskan di detail).', 5, 90)
on conflict (key) do update set label = excluded.label, description = excluded.description;

-- ---------- reference: patterns that mark government / BUMN in post data ----------
create table if not exists public.bs_gov_patterns (
  id serial primary key,
  kind text not null check (kind in ('brand','mention','caption')),  -- brand_name / collab_accounts / caption
  pattern text not null,                                              -- POSIX regex, case-insensitive
  label text not null,
  active boolean not null default true
);
insert into public.bs_gov_patterns (kind, pattern, label) values
  ('brand',   '\m(kemen|kementerian|kemkom|kominfo|komdigi|kemenkeu|kemenkes|kemendik|kemenparekraf|kemenhub|kemensos|kemenag|kemnaker|kemen ?pu|kemenperin|kemendag|kementan|kemhan|kemenlu|kemendagri)', 'Kementerian'),
  ('brand',   '\m(pemprov|pemkot|pemkab|pemda|dinas|provinsi|dki jakarta|jakarta pemprov)', 'Pemerintah daerah'),
  ('brand',   '\m(bumn|pertamina|telkom(sel)?|bank mandiri|\mbni\M|\mbri\M|brimo|bri peduli|\mpln\M|garuda indonesia|pegadaian|bulog|antam|inalum|pupuk indonesia|jasa marga|waskita|wika|adhi karya|pelindo|angkasa pura|biofarma|kimia farma|taspen|jasa raharja|bank bsi|bsi\M|btn\M|danantara|ihc|mind id|ptpn|perumnas|peruri|pos indonesia|kai\M|kereta api)', 'BUMN'),
  ('brand',   '\m(polri|polisi|tni|kodam|korem|kpu|bawaslu|ojk|bpjs|bpom|bps|djp|pajak|bea cukai|kpk|mpr|dpr|dpd|istana|presiden|wakil presiden|wonderful indonesia|bank indonesia|satgas|bnpb|basarnas|bkkbn|bnn|lkpp|bkn|kemenpan)', 'Lembaga negara'),
  ('mention', '(kemen|kominfo|komdigi|pemprov|pemkot|pemkab|dinas|polri|tni|kpu|bawaslu|ojk|bpjs|istana|dpr|pajak|kemenkes|kemendik|parekraf|bank_indonesia|bankindonesia|pertamina|telkom|bumn|presiden|wonderfulindonesia|bpom|bps_|satgas|kemenkeu|djp|bea_cukai|kpk_)', 'Akun resmi pemerintah/BUMN'),
  ('caption', '\m(presiden prabowo|prabowo subianto|gibran|kabinet merah putih|makan bergizi gratis|\mmbg\M|program pemerintah|kementerian|kemen[a-z]+|pemprov|pemkot|pemkab|gubernur|bupati|wali ?kota|dpr ri|menteri|wamen|stafsus|utusan khusus|istana|danantara|koperasi merah putih|sekolah rakyat|asta cita)', 'Topik pemerintahan')
on conflict do nothing;

-- ---------- cases ----------
create table if not exists public.bs_cases (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  title text not null,
  scope text not null default 'standard' check (scope in ('quick','standard','deep')),
  check_content boolean not null default true,
  check_founder boolean not null default true,
  check_management boolean not null default true,
  status text not null default 'open' check (status in ('open','in_review','done','archived')),
  definition text,                      -- what the client counts as "affiliated" (free text)
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bs_case_accounts (
  case_id uuid not null references public.bs_cases(id) on delete cascade,
  handle text not null,                 -- '@handle', matches accounts.handle / kol_accounts.handle
  kind text not null default 'hm' check (kind in ('hm','kol','other')),
  verdict text check (verdict in ('clear','caution','flag')),
  score int,
  summary text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (case_id, handle)
);

-- ---------- people behind the accounts ----------
create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  ig_handle text,
  x_handle text,
  tiktok_handle text,
  linkedin_url text,
  entity text,                          -- PT / grup / manajemen
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.person_accounts (
  person_id uuid not null references public.persons(id) on delete cascade,
  handle text not null,
  role text not null check (role in ('founder','owner','management')),
  title text,                           -- e.g. CEO, Head of Content
  source_url text,
  created_at timestamptz not null default now(),
  primary key (person_id, handle, role)
);
create index if not exists person_accounts_handle_idx on public.person_accounts (handle);

-- ---------- evidence ----------
create table if not exists public.bs_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.bs_cases(id) on delete set null,   -- null = global, reusable in later cases
  subject_type text not null check (subject_type in ('account','person','entity')),
  subject_key text not null,            -- '@handle' | persons.id::text | entity name
  category text not null references public.bs_categories(key),
  title text not null,
  detail text,
  url text,
  source_tier int not null default 2 check (source_tier between 1 and 4),
  -- 1 dokumen resmi/pelantikan/KPU · 2 media arus utama dgn atribusi · 3 daftar/klaim/agregator · 4 post subjek sendiri
  evidence_date date,
  still_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists bs_evidence_subject_idx on public.bs_evidence (subject_type, subject_key);
create index if not exists bs_evidence_case_idx on public.bs_evidence (case_id);

-- ---------- scan jobs (filled by the scraping skill; UI shows status/results) ----------
create table if not exists public.bs_scan_jobs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.bs_cases(id) on delete cascade,
  target_type text not null check (target_type in ('account','person')),
  target_key text not null,
  platform text not null default 'instagram' check (platform in ('instagram','x','tiktok','web')),
  window_from date,
  window_to date,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  result jsonb,
  error text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------- updated_at ----------
create or replace function public.bs_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists bs_cases_touch on public.bs_cases;
create trigger bs_cases_touch before update on public.bs_cases for each row execute function public.bs_touch();
drop trigger if exists persons_touch on public.persons;
create trigger persons_touch before update on public.persons for each row execute function public.bs_touch();

-- ---------- RLS: members only (never guests / view keys) ----------
alter table public.bs_categories   enable row level security;
alter table public.bs_gov_patterns enable row level security;
alter table public.bs_cases        enable row level security;
alter table public.bs_case_accounts enable row level security;
alter table public.persons         enable row level security;
alter table public.person_accounts enable row level security;
alter table public.bs_evidence     enable row level security;
alter table public.bs_scan_jobs    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['bs_categories','bs_gov_patterns','bs_cases','bs_case_accounts','persons','person_accounts','bs_evidence','bs_scan_jobs'] loop
    execute format('drop policy if exists %I_member_read on public.%I', t, t);
    execute format('create policy %I_member_read on public.%I for select to authenticated using (public.is_member() and not public.is_guest())', t, t);
    execute format('drop policy if exists %I_member_write on public.%I', t, t);
    execute format('create policy %I_member_write on public.%I for insert to authenticated with check (public.is_member() and not public.is_guest())', t, t);
    execute format('drop policy if exists %I_member_update on public.%I', t, t);
    execute format('create policy %I_member_update on public.%I for update to authenticated using (public.is_member() and not public.is_guest()) with check (public.is_member() and not public.is_guest())', t, t);
    execute format('drop policy if exists %I_admin_delete on public.%I', t, t);
    execute format('create policy %I_admin_delete on public.%I for delete to authenticated using (public.is_super_admin())', t, t);
  end loop;
end $$;

-- ---------- RPC: content signals for one account from ig_posts / kol_posts ----------
-- Returns totals and the matching posts (government-paid, official-account mentions, government topics)
-- inside the window, so the UI can show evidence without re-scraping.
create or replace function public.bs_content_signals(p_handle text, p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_brand text; v_mention text; v_caption text;
  v_posts jsonb; v_total int; v_spon int; v_gov_paid int; v_gov_mention int; v_gov_topic int;
  v_first date; v_last date;
begin
  if not (public.is_member() and not public.is_guest()) then raise exception 'not allowed'; end if;
  select string_agg(pattern, '|') into v_brand   from bs_gov_patterns where active and kind = 'brand';
  select string_agg(pattern, '|') into v_mention from bs_gov_patterns where active and kind = 'mention';
  select string_agg(pattern, '|') into v_caption from bs_gov_patterns where active and kind = 'caption';

  -- ig_posts (homeless media) and kol_posts share the columns used here
  with src as (
    select id, post_url, account_handle, content_type, post_category, caption, hashtags, collab_accounts,
           coalesce(published_at::date, capture_date) as d, views, likes, comments, brand_name
    from ig_posts where lower(account_handle) = lower(p_handle)
    union all
    select id, post_url, account_handle, content_type, post_category, caption, hashtags, collab_accounts,
           coalesce(published_at::date, capture_date) as d, views, likes, comments, brand_name
    from kol_posts where lower(account_handle) = lower(p_handle)
  ), win as (
    select * from src where (p_from is null or d >= p_from) and (p_to is null or d <= p_to)
  ), flagged as (
    select *,
      (v_brand   is not null and brand_name      ~* v_brand)   as gov_paid,
      (v_mention is not null and collab_accounts ~* v_mention) as gov_mention,
      (v_caption is not null and (caption ~* v_caption or hashtags ~* v_caption)) as gov_topic
    from win
  )
  select count(*), count(*) filter (where post_category = 'Sponsored' or brand_name is not null), min(d), max(d),
         count(*) filter (where gov_paid), count(*) filter (where gov_mention), count(*) filter (where gov_topic),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'url', post_url, 'date', d, 'type', content_type,
           'brand', brand_name, 'collab', collab_accounts, 'likes', likes, 'comments', comments, 'views', views,
           'caption', left(coalesce(caption, ''), 220),
           'signals', array_remove(array[case when gov_paid then 'paid' end, case when gov_mention then 'mention' end, case when gov_topic then 'topic' end], null)
         ) order by d desc) filter (where gov_paid or gov_mention or gov_topic), '[]'::jsonb)
    into v_total, v_spon, v_first, v_last, v_gov_paid, v_gov_mention, v_gov_topic, v_posts
  from flagged;

  return jsonb_build_object(
    'handle', p_handle, 'from', coalesce(p_from, v_first), 'to', coalesce(p_to, v_last),
    'total', v_total, 'sponsored', v_spon,
    'gov_paid', v_gov_paid, 'gov_mention', v_gov_mention, 'gov_topic', v_gov_topic,
    'posts', v_posts
  );
end $$;
grant execute on function public.bs_content_signals(text, date, date) to authenticated;

-- ---------- RPC: case overview (accounts + counts) ----------
create or replace function public.bs_case_overview(p_case uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'handle', ca.handle, 'kind', ca.kind, 'verdict', ca.verdict, 'score', ca.score, 'summary', ca.summary,
    'followers', coalesce(a.followers, k.followers),
    'posts', (select count(*) from ig_posts p where lower(p.account_handle) = lower(ca.handle)),
    'persons', (select count(distinct pa.person_id) from person_accounts pa where lower(pa.handle) = lower(ca.handle)),
    'evidence', (select count(*) from bs_evidence e where e.subject_type = 'account' and lower(e.subject_key) = lower(ca.handle))
      + (select count(*) from bs_evidence e join person_accounts pa on e.subject_type = 'person' and e.subject_key = pa.person_id::text where lower(pa.handle) = lower(ca.handle))
  ) order by ca.created_at), '[]'::jsonb)
  from bs_case_accounts ca
  left join accounts a on lower(a.handle) = lower(ca.handle)
  left join kol_accounts k on lower(k.handle) = lower(ca.handle)
  where ca.case_id = p_case and public.is_member() and not public.is_guest();
$$;
grant execute on function public.bs_case_overview(uuid) to authenticated;
