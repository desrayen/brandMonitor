// Brand Monitor — Google Search Console sync (Supabase Edge Function)
// Pulls Search Analytics data with a Google service account and stores it in
// gsc_daily (full totals by device x country) and gsc_query_page (query x page).
//
// Triggered by pg_cron every 10 minutes with the x-internal-secret header.
//   ?op=sync  (default) refresh recent days once per ~20h, then backfill older days
//   ?op=sites refresh the list of Search Console properties only
//
// Secrets (Supabase > Edge Functions > Secrets):
//   GSC_SERVICE_ACCOUNT_JSON  = full content of the service-account JSON key
//   (or GSC_CLIENT_EMAIL + GSC_PRIVATE_KEY)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import postgres from 'npm:postgres@3.4.5';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });

const TIME_BUDGET_MS = 110_000; // stay under the edge function wall clock limit
const RECENT_DAYS = [2, 3, 4, 5]; // GSC data settles ~2-3 days after the date
const RECENT_EVERY_MS = 20 * 3600_000;
const HISTORY_DAYS = 486; // ~16 months, GSC retention
const PAGE_SIZE = 25_000; // API max rows per request
const API = 'https://searchconsole.googleapis.com/webmasters/v3';

// ---------- Google auth (service account -> access token) ----------
function credentials() {
  const json = Deno.env.get('GSC_SERVICE_ACCOUNT_JSON');
  if (json) {
    const j = JSON.parse(json);
    return { email: j.client_email as string, key: j.private_key as string };
  }
  const email = Deno.env.get('GSC_CLIENT_EMAIL');
  const key = Deno.env.get('GSC_PRIVATE_KEY');
  if (!email || !key) throw new Error('Missing GSC_SERVICE_ACCOUNT_JSON secret');
  return { email, key: key.replace(/\\n/g, '\n') };
}

const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let cachedToken: { token: string; exp: number } | null = null;
async function accessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const { email, key } = credentials();
  const der = Uint8Array.from(
    atob(key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')),
    c => c.charCodeAt(0),
  );
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${JSON.stringify(body)}`);
  cachedToken = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return cachedToken.token;
}

async function gsc(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GSC ${res.status}: ${body?.error?.message ?? JSON.stringify(body)}`);
  return body;
}

type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function query(site: string, date: string, dimensions: string[], maxRows: number): Promise<Row[]> {
  const out: Row[] = [];
  for (let startRow = 0; startRow < maxRows; startRow += PAGE_SIZE) {
    const body = await gsc(`/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: 'POST',
      body: JSON.stringify({
        startDate: date, endDate: date, dimensions, type: 'web', dataState: 'final',
        rowLimit: Math.min(PAGE_SIZE, maxRows - startRow), startRow,
      }),
    });
    const rows: Row[] = body.rows ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

// ---------- sync ----------
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);

async function refreshSites() {
  const body = await gsc('/sites');
  const entries: { siteUrl: string; permissionLevel: string }[] = body.siteEntry ?? [];
  for (const e of entries) {
    if (e.permissionLevel === 'siteUnverifiedUser') continue;
    await sql`
      insert into public.gsc_sites (site_url, permission_level)
      values (${e.siteUrl}, ${e.permissionLevel})
      on conflict (site_url) do update set permission_level = excluded.permission_level, updated_at = now()`;
  }
  return entries.map(e => e.siteUrl);
}

async function syncDate(site: string, date: string, maxRows: number) {
  const totals = await query(site, date, ['device', 'country'], 5000);
  const qp = await query(site, date, ['query', 'page'], maxRows);
  await sql.begin(async tx => {
    await tx`delete from public.gsc_daily where site_url = ${site} and date = ${date}`;
    await tx`delete from public.gsc_query_page where site_url = ${site} and date = ${date}`;
    const daily = totals.map(r => ({
      site_url: site, date, device: r.keys[0], country: r.keys[1],
      clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
    }));
    for (let i = 0; i < daily.length; i += 1000) await tx`insert into public.gsc_daily ${tx(daily.slice(i, i + 1000))}`;
    const rows = qp.map(r => ({
      site_url: site, date, query: r.keys[0], page: r.keys[1],
      clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
    }));
    for (let i = 0; i < rows.length; i += 1000) await tx`insert into public.gsc_query_page ${tx(rows.slice(i, i + 1000))}`;
  });
  return { daily: totals.length, queryPage: qp.length };
}

async function sync(started: number) {
  const log: Record<string, unknown>[] = [];
  const timeLeft = () => Date.now() - started < TIME_BUDGET_MS;

  // Pick up newly added Search Console properties (cheap: one API call)
  await refreshSites();

  const sites = await sql`select * from public.gsc_sites where enabled order by site_url`;
  for (const s of sites) {
    const site = s.site_url as string;
    try {
      // 1) Recent days (re-synced because GSC numbers settle after a few days)
      const recentDue = !s.recent_synced_at || Date.now() - new Date(s.recent_synced_at).getTime() > RECENT_EVERY_MS;
      if (recentDue && timeLeft()) {
        for (const n of RECENT_DAYS) {
          const date = isoDaysAgo(n);
          log.push({ site, date, kind: 'recent', ...(await syncDate(site, date, s.max_rows_per_day)) });
        }
        await sql`
          update public.gsc_sites set recent_synced_at = now(), last_error = null, updated_at = now(),
            backfill_cursor = coalesce(backfill_cursor, ${isoDaysAgo(RECENT_DAYS[RECENT_DAYS.length - 1])}::date)
          where site_url = ${site}`;
      }
      // 2) Backfill older days, walking backwards ~16 months
      let [{ backfill_cursor: cursor, backfill_done: done }] =
        await sql`select backfill_cursor, backfill_done from public.gsc_sites where site_url = ${site}`;
      const oldest = isoDaysAgo(HISTORY_DAYS);
      while (cursor && !done && timeLeft()) {
        const date = addDays(new Date(cursor).toISOString().slice(0, 10), -1);
        if (date < oldest) {
          done = true;
          await sql`update public.gsc_sites set backfill_done = true, updated_at = now() where site_url = ${site}`;
          break;
        }
        log.push({ site, date, kind: 'backfill', ...(await syncDate(site, date, s.max_rows_per_day)) });
        await sql`update public.gsc_sites set backfill_cursor = ${date}::date, last_error = null, updated_at = now() where site_url = ${site}`;
        cursor = date;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.push({ site, error: msg });
      await sql`update public.gsc_sites set last_error = ${msg}, updated_at = now() where site_url = ${site}`;
    }
  }
  return log;
}

Deno.serve(async req => {
  const started = Date.now();
  const [cfg] = await sql`select value from gsc_private.config where key = 'internal_secret'`;
  if (!cfg || req.headers.get('x-internal-secret') !== cfg.value) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  try {
    const op = new URL(req.url).searchParams.get('op') ?? 'sync';
    const result = op === 'sites' ? { sites: await refreshSites() } : { synced: await sync(started) };
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500 });
  }
});
