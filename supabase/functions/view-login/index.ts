// Brand Monitor — shared read-only access via view keys.
// POST { view_key }            → { token_hash, pages, label }   (public; the key itself is the secret)
// POST { action: 'delete', id } → deletes a view key and its guest account (super admin only)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const guestEmail = (keyId: string) => `guest-${keyId}@view.brandmonitor.invalid`;

async function ensureGuest(keyId: string, guestUserId: string | null): Promise<string> {
  if (guestUserId) {
    const { data } = await admin.auth.admin.getUserById(guestUserId);
    if (data?.user) {
      if (data.user.app_metadata?.view_key_id !== keyId) {
        await admin.auth.admin.updateUserById(guestUserId, { app_metadata: { view_key_id: keyId } });
      }
      return guestUserId;
    }
  }
  const email = guestEmail(keyId);
  let userId: string | undefined;
  const { data: created, error } = await admin.auth.admin.createUser({
    email, email_confirm: true,
    app_metadata: { view_key_id: keyId },
    user_metadata: { full_name: 'Guest (view key)' },
  });
  if (created?.user) userId = created.user.id;
  else {
    // already exists (e.g. link was lost) → find it
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      userId = data?.users.find(u => u.email === email)?.id;
      if (!data || data.users.length < 200) break;
    }
    if (!userId) throw new Error(error?.message ?? 'Could not create guest account');
    await admin.auth.admin.updateUserById(userId, { app_metadata: { view_key_id: keyId } });
  }
  await admin.from('view_keys').update({ guest_user_id: userId }).eq('id', keyId);
  return userId;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === 'delete') {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return json({ error: 'Not signed in' }, 401);
      const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
      if (role?.role !== 'super_admin') return json({ error: 'Not allowed' }, 403);
      const { data: key } = await admin.from('view_keys').select('id, guest_user_id').eq('id', body.id).maybeSingle();
      if (!key) return json({ ok: true });
      if (key.guest_user_id) await admin.auth.admin.deleteUser(key.guest_user_id);
      const { error } = await admin.from('view_keys').delete().eq('id', key.id);
      if (error) throw error;
      return json({ ok: true });
    }

    const viewKey = typeof body.view_key === 'string' ? body.view_key.trim().toLowerCase() : '';
    if (!/^[a-z0-9]{16,64}$/.test(viewKey)) return json({ error: 'Invalid view key' }, 400);
    const { data: k, error } = await admin.rpc('view_key_for_login', { p_key: viewKey });
    if (error) throw error;
    if (!k) return json({ error: 'This view key is invalid, revoked or expired.' }, 404);

    const userId = await ensureGuest(k.id, k.guest_user_id);
    const { data: u } = await admin.auth.admin.getUserById(userId);
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u!.user!.email! });
    if (linkErr) throw linkErr;
    return json({ token_hash: link.properties.hashed_token, pages: k.pages, label: k.label });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
