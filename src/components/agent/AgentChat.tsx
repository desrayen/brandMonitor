import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Brain, CheckCircle2, ChevronDown, Database, Loader2, MessageSquare, Plus, Sparkles, Wrench, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ToolStep = { purpose: string; query: string; rows?: number; error?: string; running?: boolean };
type Meta = { tools?: ToolStep[]; duration_ms?: number; model?: string };
type Msg = { id: string; role: 'user' | 'assistant'; content: string; meta?: Meta; pending?: boolean; error?: string };
type Thread = { id: string; title: string; updated_at: string };

const SUGGESTIONS = [
  'Brand mana yang paling banyak sponsored post?',
  'Top 5 akun dengan ER tertinggi',
  'Bandingkan performa Reel vs Carousel',
  'Kategori viral apa yang paling banyak likes?',
];

const FN_URL = `${(import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/agent-chat`;

export function AgentChat() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadThreads = useCallback(async () => {
    const { data } = await supabase.from('chat_threads').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(30);
    setThreads(data ?? []);
  }, []);

  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  async function openThread(id: string) {
    if (busy) return;
    setThreadId(id);
    const { data } = await supabase.from('chat_messages').select('id, role, content, meta').eq('thread_id', id).order('created_at', { ascending: true });
    setMessages((data ?? []) as Msg[]);
  }

  function newChat() {
    if (busy) return;
    setThreadId(null);
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    setBusy(true);
    const assistantId = crypto.randomUUID();
    setMessages(m => [...m, { id: crypto.randomUUID(), role: 'user', content: message }, { id: assistantId, role: 'assistant', content: '', pending: true, meta: { tools: [] } }]);
    const patch = (fn: (msg: Msg) => Msg) => setMessages(m => m.map(x => (x.id === assistantId ? fn(x) : x)));
    const started = Date.now();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ message, thread_id: threadId }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const event = /^event: (.*)$/m.exec(part)?.[1];
          const raw = /^data: (.*)$/m.exec(part)?.[1];
          if (!event || !raw) continue;
          const data = JSON.parse(raw);
          if (event === 'thread') { if (!threadId) setThreadId(data.id); }
          else if (event === 'tool_start') patch(x => ({ ...x, meta: { ...x.meta, tools: [...(x.meta?.tools ?? []), { purpose: data.purpose, query: data.query, running: true }] } }));
          else if (event === 'tool_end') patch(x => ({ ...x, meta: { ...x.meta, tools: (x.meta?.tools ?? []).map((t, i) => (i === data.index ? { ...t, running: false, rows: data.rows, error: data.error } : t)) } }));
          else if (event === 'text') patch(x => ({ ...x, content: data.content }));
          else if (event === 'done') patch(x => ({ ...x, pending: false, meta: { ...x.meta, ...data, tools: data.tools } }));
          else if (event === 'error') throw new Error(data.message);
        }
      }
      patch(x => ({ ...x, pending: false, meta: { ...x.meta, duration_ms: x.meta?.duration_ms ?? Date.now() - started } }));
    } catch (e) {
      patch(x => ({ ...x, pending: false, error: (e as Error).message }));
    } finally {
      setBusy(false);
      loadThreads();
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  return <section className="agent-shell">
    <aside className="agent-threads">
      <button className="agent-new" onClick={newChat}><Plus size={14} />New chat</button>
      <p className="agent-threads-label">Recent</p>
      <nav>
        {threads.length === 0 && <p className="agent-threads-empty">No chats yet</p>}
        {threads.map(t => <button key={t.id} className={t.id === threadId ? 'agent-thread active' : 'agent-thread'} onClick={() => openThread(t.id)} title={t.title}>
          <MessageSquare size={13} /><span>{t.title}</span>
        </button>)}
      </nav>
    </aside>

    <div className="agent-main">
      <div className="agent-scroll">
        {messages.length === 0 ? <div className="agent-empty">
          <span className="agent-empty-mark"><Sparkles size={18} /></span>
          <h2>Tanya Brand Monitor</h2>
          <p>Agent membaca data IG langsung dari database (ig_posts, accounts, brands) dan menjawab dengan angka nyata.</p>
          <div className="agent-suggestions">{SUGGESTIONS.map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
        </div> : <div className="agent-thread-body">
          {messages.map(m => m.role === 'user'
            ? <div key={m.id} className="agent-user"><p>{m.content}</p></div>
            : <AssistantMessage key={m.id} msg={m} />)}
          <div ref={bottomRef} />
        </div>}
      </div>

      <div className="agent-composer-wrap">
        <div className="agent-composer">
          <div className="agent-composer-head">
            <span className="agent-conn"><Database size={12} />Supabase connected</span>
            <span className="agent-dot" />
            <span>Agent · 1 tool · Haiku 5.5</span>
          </div>
          <div className="agent-composer-box">
            <textarea ref={inputRef} rows={2} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} placeholder="Tanya apa saja tentang data…" disabled={busy} />
            <div className="agent-composer-actions">
              <span className="agent-hint">Enter to send · Shift+Enter for new line</span>
              <button className="agent-send" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send">
                {busy ? <Loader2 size={16} className="auth-spin" /> : <ArrowUp size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

function AssistantMessage({ msg }: { msg: Msg }) {
  const [open, setOpen] = useState(false);
  const tools = msg.meta?.tools ?? [];
  const rows = tools.reduce((s, t) => s + (t.rows ?? 0), 0);
  const secs = msg.meta?.duration_ms ? Math.max(1, Math.round(msg.meta.duration_ms / 1000)) : null;

  return <div className="agent-assistant">
    <p className="agent-meta"><Brain size={14} />{msg.pending ? <span className="agent-shimmer">Thinking…</span> : <span>Thought for {secs ?? '–'}s</span>}</p>
    {tools.length > 0 && <div className="agent-tools">
      <button className="agent-meta agent-meta-btn" onClick={() => setOpen(!open)}>
        <Wrench size={14} /><span>Used {tools.length} tool{tools.length > 1 ? 's' : ''} · scanned {rows.toLocaleString('en-US')} rows</span>
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
      </button>
      <ul className={open || msg.pending ? 'agent-tool-list open' : 'agent-tool-list'}>
        {tools.map((t, i) => <li key={i}>
          {t.running ? <Loader2 size={14} className="auth-spin" /> : t.error ? <XCircle size={14} className="agent-ico-err" /> : <CheckCircle2 size={14} className="agent-ico-ok" />}
          <div>
            <strong>{t.purpose}</strong>
            <span>{t.running ? 'Running query…' : t.error ? t.error : `${t.rows} rows`}</span>
            {open && <pre>{t.query}</pre>}
          </div>
          <em>SQL</em>
        </li>)}
      </ul>
    </div>}
    {msg.error ? <p className="auth-error">{msg.error}</p> : msg.content && <div className="agent-md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: props => <a {...props} target="_blank" rel="noreferrer" /> }}>{msg.content}</ReactMarkdown></div>}
  </div>;
}
