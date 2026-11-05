-- Brand Safety · per-account affiliation summary ("Afiliasi" tab).
-- One row per monitored account: who it is probably affiliated with, how strong, why, and
-- at least five credible links where the digital trail can be read. Members only.

create table if not exists public.bs_affiliations (
  handle text primary key,                       -- '@handle' (accounts.handle / kol_accounts.handle)
  entity text,                                   -- badan usaha / grup di balik akun (mis. "PT Multi Garam Utama Tbk (FOLK)")
  group_name text,                               -- nama grup untuk mengelompokkan akun (mis. "FOLK Group")
  affiliated_name text,                          -- "Probable Affiliated with Gov": nama orang/lembaga
  status text not null default 'unknown' check (status in ('unknown','none','low','medium','high')),
  -- low = kemungkinan hubungan keluarga/jaringan · medium = afiliasi jelas · high = sangat jelas, termasuk investasi langsung/tidak langsung
  detail text,                                   -- penjelasan faktual, bersumber
  links jsonb not null default '[]'::jsonb,      -- [{url, title, source, date}] — minimal 5 untuk status low/medium/high
  researched_at date,
  researched_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists bs_affiliations_touch on public.bs_affiliations;
create trigger bs_affiliations_touch before update on public.bs_affiliations for each row execute function public.bs_touch();

alter table public.bs_affiliations enable row level security;
drop policy if exists bs_affiliations_member_read on public.bs_affiliations;
create policy bs_affiliations_member_read on public.bs_affiliations for select to authenticated using (public.is_member() and not public.is_guest());
drop policy if exists bs_affiliations_member_write on public.bs_affiliations;
create policy bs_affiliations_member_write on public.bs_affiliations for insert to authenticated with check (public.is_member() and not public.is_guest());
drop policy if exists bs_affiliations_member_update on public.bs_affiliations;
create policy bs_affiliations_member_update on public.bs_affiliations for update to authenticated using (public.is_member() and not public.is_guest()) with check (public.is_member() and not public.is_guest());
drop policy if exists bs_affiliations_admin_delete on public.bs_affiliations;
create policy bs_affiliations_admin_delete on public.bs_affiliations for delete to authenticated using (public.is_super_admin());

-- Overview: every monitored HM account joined with its affiliation row (unknown when not researched yet).
create or replace function public.bs_affiliation_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'handle', a.handle, 'followers', a.followers, 'region', a.region,
    'entity', f.entity, 'group_name', f.group_name, 'affiliated_name', f.affiliated_name,
    'status', coalesce(f.status, 'unknown'), 'detail', f.detail, 'links', coalesce(f.links, '[]'::jsonb),
    'researched_at', f.researched_at, 'updated_at', f.updated_at
  ) order by case coalesce(f.status,'unknown') when 'high' then 0 when 'medium' then 1 when 'low' then 2 when 'none' then 3 else 4 end, a.followers desc nulls last), '[]'::jsonb)
  from accounts a
  left join bs_affiliations f on lower(f.handle) = lower(a.handle)
  where public.is_member() and not public.is_guest();
$$;
grant execute on function public.bs_affiliation_overview() to authenticated;
