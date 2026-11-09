-- Brand Safety · Tokoh: probable status / affiliated-with-gov / detail / references, mirroring bs_affiliations.
alter table public.persons
  add column if not exists probable_status text not null default 'unknown' check (probable_status in ('unknown','none','low','medium','high')),
  add column if not exists probable_affiliated_with text,
  add column if not exists status_detail text,
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists researched_at date,
  add column if not exists researched_by text;

create or replace function public.bs_person_overview(p_days integer default 92)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'position', p.position, 'entity', p.entity, 'notes', p.notes,
    'probable_status', p.probable_status, 'probable_affiliated_with', p.probable_affiliated_with, 'status_detail', p.status_detail,
    'links', p.links, 'researched_at', p.researched_at,
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
$function$;
