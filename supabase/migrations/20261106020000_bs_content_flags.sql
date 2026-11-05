-- Brand Safety · per-account content check ("Konten" columns on the Afiliasi tab).
-- Scans ig_posts in a rolling window (default 92 days) for government/BUMN sponsorship and government topics,
-- and writes a flag + human-readable reason + example posts onto bs_affiliations. Re-runnable.

alter table public.bs_affiliations
  add column if not exists content_flag text not null default 'no_data'
    check (content_flag in ('no_data','none','editorial','paid')),
  add column if not exists content_posts int not null default 0,          -- total posts in window
  add column if not exists content_paid_posts int not null default 0,     -- posts sponsored by gov/BUMN brand
  add column if not exists content_topic_posts int not null default 0,    -- posts mentioning gov topics/officials (not sponsored)
  add column if not exists content_window_from date,
  add column if not exists content_window_to date,
  add column if not exists content_reason text,                           -- generated explanation
  add column if not exists content_note text,                             -- manual reviewer note (tone, context)
  add column if not exists content_examples jsonb not null default '[]'::jsonb, -- [{shortcode,url,date,type,brand,caption,views}]
  add column if not exists content_checked_at timestamptz;

-- Fix over-broad caption pattern ("kemen[a-z]+" matched "kemenangan") and widen the topic vocabulary.
update public.bs_gov_patterns set pattern =
  '\m(presiden prabowo|prabowo subianto|prabowo|gibran|jokowi|joko widodo|kabinet merah putih|makan bergizi gratis|\mmbg\M|badan gizi nasional|\mbgn\M|program pemerintah|pemerintah|kementerian|kemen(?!angan)[a-z]+|pemprov|pemkot|pemkab|gubernur|bupati|wali ?kota|dpr ri|dprd|\mdpr\M|\mdpd\M|menteri|menko|wamen|dirjen|stafsus|seskab|utusan khusus|istana|danantara|koperasi merah putih|sekolah rakyat|asta cita|kapolri|polri|\mkpk\M|\mkpu\M|bawaslu|mahkamah agung|mahkamah konstitusi|\mbumn\M|pramono anung|dedi mulyadi)'
where kind = 'caption' and label = 'Topik pemerintahan';

create or replace function public.bs_refresh_content_flags(p_days int default 92)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  bp text; cp text; mp text;
  v_from date := (now() - make_interval(days => p_days))::date;
  v_to date := now()::date;
  n int;
begin
  select string_agg('('||pattern||')','|') into bp from bs_gov_patterns where active and kind = 'brand';
  select string_agg('('||pattern||')','|') into cp from bs_gov_patterns where active and kind = 'caption';
  select string_agg('('||pattern||')','|') into mp from bs_gov_patterns where active and kind = 'mention';

  -- every monitored account gets a row (status stays 'unknown' until researched)
  insert into bs_affiliations (handle)
  select a.handle from accounts a
  where not exists (select 1 from bs_affiliations f where lower(f.handle) = lower(a.handle))
  on conflict do nothing;

  with posts as (
    select p.account_handle, p.shortcode, p.post_url, p.published_at, p.brand_name, p.offer_type, p.caption, p.hashtags, p.views,
      (coalesce(p.brand_name,'') ~* bp) as paid,
      (coalesce(p.collab_accounts,'') ~* mp) as mention,
      ((coalesce(p.caption,'')||' '||coalesce(p.hashtags,'')) ~* cp) as topic
    from ig_posts p
    where p.published_at >= now() - make_interval(days => p_days)
  ), agg as (
    select lower(account_handle) h, count(*) total,
      count(*) filter (where paid) paid_n,
      count(*) filter (where (topic or mention) and not paid) topic_n,
      min(published_at)::date d0, max(published_at)::date d1
    from posts group by 1
  ), brands as (
    select h, string_agg(bn||' ×'||c, ', ' order by c desc) s from (
      select lower(account_handle) h, coalesce(brand_name,'?') bn, count(*) c from posts where paid group by 1,2) b group by 1
  ), topics as (
    select h, string_agg(kw||' ×'||c, ', ' order by c desc) s from (
      select h, kw, count(*) c from (
        select lower(account_handle) h, lower((regexp_matches(coalesce(caption,'')||' '||coalesce(hashtags,''), cp, 'gi'))[1]) kw
        from posts where topic and not paid) t
      group by 1,2) t2 group by h
  ), ex as (
    select h, jsonb_agg(jsonb_build_object(
        'shortcode', shortcode,
        'url', coalesce(post_url, 'https://www.instagram.com/p/'||shortcode||'/'),
        'date', published_at::date,
        'type', case when paid then 'paid' when mention then 'mention' else 'topic' end,
        'brand', brand_name, 'offer', offer_type,
        'caption', left(regexp_replace(coalesce(caption,''), '\s+', ' ', 'g'), 200),
        'views', views) order by paid desc, published_at desc) j
    from (select lower(account_handle) h, *, row_number() over (partition by lower(account_handle) order by paid desc, published_at desc) rn
          from posts where paid or topic or mention) q
    where rn <= 12 group by h
  )
  update bs_affiliations f set
    content_posts = coalesce(a.total, 0),
    content_paid_posts = coalesce(a.paid_n, 0),
    content_topic_posts = coalesce(a.topic_n, 0),
    content_flag = case when a.total is null or a.total = 0 then 'no_data'
                        when a.paid_n > 0 then 'paid'
                        when a.topic_n > 0 then 'editorial'
                        else 'none' end,
    content_window_from = v_from,
    content_window_to = v_to,
    content_examples = coalesce(ex.j, '[]'::jsonb),
    content_reason = case
      when a.total is null then
        'Belum ada post akun ini yang tertangkap scraper dalam periode '||to_char(v_from,'DD Mon YYYY')||'–'||to_char(v_to,'DD Mon YYYY')||'; perlu backfill histori.'
      else
        (case when a.paid_n > 0 then a.paid_n||' post bersponsor instansi pemerintah/BUMN ('||br.s||')' else '' end)
        || (case when a.paid_n > 0 and a.topic_n > 0 then ' + ' else '' end)
        || (case when a.topic_n > 0 then a.topic_n||' post liputan/pembahasan topik pemerintahan (kata kunci: '||coalesce(tp.s,'-')||')' else '' end)
        || (case when a.paid_n = 0 and a.topic_n = 0 then 'Tidak ada post yang menyebut instansi/pejabat pemerintah atau bersponsor pemerintah/BUMN' else '' end)
        || ' — dari '||a.total||' post terpantau '||to_char(a.d0,'DD Mon')||'–'||to_char(a.d1,'DD Mon YYYY')||'.'
        || (case when a.topic_n > 0 and a.paid_n = 0 then ' Liputan editorial bukan indikator afiliasi; lihat catatan nada.' else '' end)
      end,
    content_checked_at = now()
  from accounts ac
  left join agg a on a.h = lower(ac.handle)
  left join brands br on br.h = lower(ac.handle)
  left join topics tp on tp.h = lower(ac.handle)
  left join ex on ex.h = lower(ac.handle)
  where lower(f.handle) = lower(ac.handle);
  get diagnostics n = row_count;
  return jsonb_build_object('updated', n, 'from', v_from, 'to', v_to);
end $$;
grant execute on function public.bs_refresh_content_flags(int) to authenticated;

-- Overview now carries the content columns too.
create or replace function public.bs_affiliation_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'handle', a.handle, 'followers', a.followers, 'region', a.region,
    'entity', f.entity, 'group_name', f.group_name, 'affiliated_name', f.affiliated_name,
    'status', coalesce(f.status, 'unknown'), 'detail', f.detail, 'links', coalesce(f.links, '[]'::jsonb),
    'researched_at', f.researched_at, 'updated_at', f.updated_at,
    'content_flag', coalesce(f.content_flag, 'no_data'), 'content_posts', coalesce(f.content_posts, 0),
    'content_paid_posts', coalesce(f.content_paid_posts, 0), 'content_topic_posts', coalesce(f.content_topic_posts, 0),
    'content_window_from', f.content_window_from, 'content_window_to', f.content_window_to,
    'content_reason', f.content_reason, 'content_note', f.content_note,
    'content_examples', coalesce(f.content_examples, '[]'::jsonb), 'content_checked_at', f.content_checked_at
  ) order by case coalesce(f.status,'unknown') when 'high' then 0 when 'medium' then 1 when 'low' then 2 when 'none' then 3 else 4 end,
             case coalesce(f.content_flag,'no_data') when 'paid' then 0 when 'editorial' then 1 when 'none' then 2 else 3 end,
             a.followers desc nulls last), '[]'::jsonb)
  from accounts a
  left join bs_affiliations f on lower(f.handle) = lower(a.handle)
  where public.is_member() and not public.is_guest();
$$;
grant execute on function public.bs_affiliation_overview() to authenticated;
