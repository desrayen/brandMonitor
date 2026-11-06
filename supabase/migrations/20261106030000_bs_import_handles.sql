-- Brand Safety · import a pasted list of Instagram handles and return their full
-- affiliation + content data (used by the "Import link & Export Excel" feature on the Afiliasi tab).
-- Unknown handles are added to accounts (followers 0 until the next scrape) + bs_affiliations (status 'unknown')
-- only when p_add is true AND the caller is a super admin. Members/guests rules follow bs_affiliation_overview().

create or replace function public.bs_import_handles(p_handles text[], p_add boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  hs text[];
  new_h text[];
  added text[] := '{}';
  not_added text[] := '{}';
  excluded text[] := array['@jktfoodbang', '@giladiskonn'];
  can_add boolean := coalesce(p_add, false) and public.is_super_admin();
begin
  if not (public.is_member() and not public.is_guest()) then
    raise exception 'not allowed';
  end if;

  select coalesce(array_agg(distinct h), '{}') into hs from (
    select '@' || lower(regexp_replace(trim(x), '^@', '')) h
    from unnest(coalesce(p_handles, '{}')) x
    where regexp_replace(trim(x), '^@', '') ~ '^[A-Za-z0-9._]{1,30}$'
  ) s;

  select coalesce(array_agg(h), '{}') into new_h from unnest(hs) h
  where not exists (select 1 from accounts a where lower(a.handle) = h);

  if coalesce(array_length(new_h, 1), 0) > 0 then
    if can_add then
      insert into accounts (handle, followers, region)
        select h, 0, 'ID' from unnest(new_h) h where not (h = any(excluded))
        on conflict do nothing;
      insert into bs_affiliations (handle)
        select h from unnest(new_h) h
        where not (h = any(excluded)) and not exists (select 1 from bs_affiliations f where lower(f.handle) = h)
        on conflict do nothing;
      select coalesce(array_agg(h), '{}') into added from unnest(new_h) h where not (h = any(excluded));
      select coalesce(array_agg(h), '{}') into not_added from unnest(new_h) h where h = any(excluded);
    else
      not_added := new_h;
    end if;
  end if;

  return jsonb_build_object(
    'added', to_jsonb(added),
    'not_added', to_jsonb(not_added),
    'rows', (
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
      )), '[]'::jsonb)
      from accounts a
      left join bs_affiliations f on lower(f.handle) = lower(a.handle)
      where lower(a.handle) = any(hs)
    )
  );
end $$;
grant execute on function public.bs_import_handles(text[], boolean) to authenticated;
