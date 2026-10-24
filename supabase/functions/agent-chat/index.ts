// Brand Monitor AI agent — Supabase Edge Function
// Calls Claude (Haiku) with a read-only SQL tool over the IG data and streams progress as SSE.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.5';

const MODEL = 'claude-haiku-5-5';
const MAX_STEPS = 8;
const MAX_ROWS = 200;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });

const SYSTEM = `You are the Brand Monitor analyst agent inside an Instagram viral-content dashboard for Indonesian accounts.
Answer questions about the data by querying the database with the run_sql tool. Never guess numbers — query them.

Database (PostgreSQL, read-only):
- ig_posts: one row per viral Instagram post. Columns: id, capture_date (date the post was collected), published_at (timestamptz, show in WIB = Asia/Jakarta), post_url, shortcode, account_handle (→ accounts.handle), content_type ('Reel' | 'Carousel' | 'Single Image'), post_category ('Organic Post' | 'Sponsored Post'), caption, hashtags, collab_accounts, duration_s, carousel_slides, region, views, likes, comments, shares, reposts, er_by_followers (numeric, already a percentage), er_by_views, likes_hidden (bool), note, viral_category, viral_format, primary_trigger, share_driver, save_driver, offer_type, brand_name (sponsor brand, null for organic), brand_url_guess, product_name, product_type, creator_setup.
- accounts: handle (pk), followers (bigint), region.
- brands: id, name, category, website, instagram, logo_url.

Rules:
- Only SELECT/WITH queries. Always aggregate or add LIMIT; keep results small.
- Use ILIKE for fuzzy text matches on brand/account names. Handles are stored without '@'.
- If likes_hidden is true, likes are unreliable — mention it when relevant.
- Reply in the same language as the user (Indonesian or English).
- Be concise and lead with the answer. Use short markdown tables for rankings/comparisons (max ~10 rows), format numbers with thousands separators, show ER with %.
- Prefix account handles with @. Link posts with their post_url when listing specific posts.
- If the data cannot answer the question, say so plainly and suggest what data would be needed.`;

const TOOLS = [{
  name: 'run_sql',
  description: 'Run one read-only PostgreSQL SELECT (or WITH … SELECT) query against the Brand Monitor database and get rows back as JSON (max 200 rows).',
  input_schema: {
    type: 'object',
    properties: {
      purpose: { type: 'string', description: 'Short human-readable description of what this query finds, in the user\'s language (shown in the UI).' },
      query: { type: 'string', description: 'A single SELECT or WITH query. No semicolons, no writes.' },
    },
    required: ['purpose', 'query'],
  },
}];

async function runSql(query: string) {
  const q = query.trim().replace(/;+\s*$/, '');
  if (!/^(select|with)\b/i.test(q)) throw new Error('Only SELECT / WITH queries are allowed.');
  if (q.includes(';')) throw new Error('Only a single statement is allowed.');
  const rows = await sql.begin('read only', async tx => {
    await tx`set local role agent_reader`;
    await tx`set local statement_timeout = '8s'`;
    return await tx.unsafe(`select * from (${q}) as agent_q limit ${MAX_ROWS + 1}`);
  });
  const list = Array.from(rows as unknown as Record<string, unknown>[]);
  return { rows: list.slice(0, MAX_ROWS), truncated: list.length > MAX_ROWS };
}

async function callClaude(messages: unknown[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      // Needed only for API keys that are not scoped to a workspace
      ...(Deno.env.get('ANTHROPIC_WORKSPACE_ID') ? { 'anthropic-workspace-id': Deno.env.get('ANTHROPIC_WORKSPACE_ID')! } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Claude API error ${res.status}`);
  return body;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!user) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { ...cors, 'content-type': 'application/json' } });

  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY secret is not set in Supabase.' }), { status: 500, headers: { ...cors, 'content-type': 'application/json' } });
  }

  const { message, thread_id } = await req.json().catch(() => ({}));
  if (typeof message !== 'string' || !message.trim()) {
    return new Response(JSON.stringify({ error: 'Empty message' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const started = Date.now();
      const tools: { purpose: string; query: string; rows?: number; error?: string }[] = [];
      try {
        // Thread
        let threadId = thread_id as string | undefined;
        if (!threadId) {
          const { data, error } = await supabase.from('chat_threads').insert({ title: message.trim().slice(0, 80) }).select('id').single();
          if (error) throw error;
          threadId = data.id;
        }
        send('thread', { id: threadId });

        // History (text only) + new message
        const { data: history } = await supabase.from('chat_messages').select('role, content').eq('thread_id', threadId).order('created_at', { ascending: true }).limit(20);
        await supabase.from('chat_messages').insert({ thread_id: threadId, role: 'user', content: message.trim() });
        const messages: { role: string; content: unknown }[] = [...(history ?? []).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: message.trim() }];

        let finalText = '';
        let usage = { input_tokens: 0, output_tokens: 0 };
        for (let step = 0; step < MAX_STEPS; step++) {
          const resp = await callClaude(messages);
          usage = { input_tokens: usage.input_tokens + (resp.usage?.input_tokens ?? 0), output_tokens: usage.output_tokens + (resp.usage?.output_tokens ?? 0) };
          messages.push({ role: 'assistant', content: resp.content });
          const toolUses = resp.content.filter((b: { type: string }) => b.type === 'tool_use');
          if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
            finalText = resp.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n').trim();
            break;
          }
          const results = [];
          for (const tu of toolUses) {
            const { purpose = 'Query', query = '' } = tu.input ?? {};
            const entry: { purpose: string; query: string; rows?: number; error?: string } = { purpose, query };
            tools.push(entry);
            send('tool_start', { index: tools.length - 1, purpose, query });
            try {
              const out = await runSql(query);
              entry.rows = out.rows.length;
              send('tool_end', { index: tools.length - 1, rows: out.rows.length });
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 30000) });
            } catch (e) {
              entry.error = (e as Error).message;
              send('tool_end', { index: tools.length - 1, error: entry.error });
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: `Error: ${entry.error}`, is_error: true });
            }
          }
          messages.push({ role: 'user', content: results });
        }
        if (!finalText) finalText = 'Maaf, saya belum bisa menyelesaikan analisis ini. Coba persempit pertanyaannya.';

        const meta = { tools, duration_ms: Date.now() - started, model: MODEL, usage };
        await supabase.from('chat_messages').insert({ thread_id: threadId, role: 'assistant', content: finalText, meta });
        await supabase.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
        send('text', { content: finalText });
        send('done', meta);
      } catch (e) {
        send('error', { message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...cors, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
});
