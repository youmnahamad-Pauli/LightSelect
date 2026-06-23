'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Send, Download, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useProjectContext } from '@/context/project-context';
import { api } from '@/lib/api-client';
import type { ConversationMessage, FileRef, ToolTraceEntry } from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── Sub-components ───────────────────────────────────────────────────────────

function FileRefButton({ fileRef }: { fileRef: FileRef }) {
  const { token } = useAuth();

  async function handleDownload() {
    if (!token) return;
    const url = `${BASE_URL}${fileRef.ref}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { alert('Download failed'); return; }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileRef.filename ?? fileRef.label;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }

  return (
    <div className="mt-2 flex flex-col gap-0.5">
      <button
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
      >
        <Download size={12} />
        {fileRef.label}
      </button>
      {fileRef.note && (
        <span className="flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle size={11} />
          {fileRef.note}
        </span>
      )}
    </div>
  );
}

function ToolTrace({ entries }: { entries: ToolTraceEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {entries.length} tool call{entries.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {entries.map((e, i) => (
            <div key={i} className="rounded bg-surface-subtle p-2 font-mono text-[11px] text-ink-muted">
              <span className="font-semibold text-ink">{e.tool}</span>
              {Object.keys(e.args).length > 0 && (
                <span className="ml-1 text-ink-muted">
                  ({JSON.stringify(e.args)})
                </span>
              )}
              <div className="mt-0.5 truncate text-[10px] opacity-70">{e.result_summary}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface BubbleProps {
  role: 'user' | 'assistant';
  content: string;
  file_refs?: FileRef[];
  tool_trace?: ToolTraceEntry[];
}

function Bubble({ role, content, file_refs = [], tool_trace = [] }: BubbleProps) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
          isUser
            ? 'bg-primary text-white'
            : 'bg-surface border border-border text-ink'
        }`}
      >
        <p className="whitespace-pre-wrap">{content}</p>
        {!isUser && file_refs.length > 0 && (
          <div className="mt-2 space-y-1">
            {file_refs.map((r, i) => (
              <FileRefButton key={i} fileRef={r} />
            ))}
          </div>
        )}
        {!isUser && <ToolTrace entries={tool_trace} />}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  file_refs?: FileRef[];
  tool_trace?: ToolTraceEntry[];
}

export default function ConversationPage() {
  const { token } = useAuth();
  const { project } = useProjectContext();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || !token || !project) return;

    const userMsg: DisplayMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setError(null);
    setLoading(true);

    const history: ConversationMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const result = await api.conversation.send(token, project.id, text, history);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.answer,
          file_refs: result.file_refs,
          tool_trace: result.tool_trace,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col">
      {/* Header */}
      <div className="border-b border-border bg-surface px-6 py-4">
        <h1 className="text-base font-semibold text-ink">Project Assistant</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          Ask about this project&apos;s schedule, match results, documents, and submittal status. Read-only — cannot select products or modify data.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">
            <div className="text-center space-y-2 max-w-sm">
              <p className="font-medium">Ask me about this project</p>
              <p className="text-xs">Try: &ldquo;What items are on the schedule?&rdquo; or &ldquo;Is the submittal ready to export?&rdquo;</p>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble
            key={i}
            role={m.role}
            content={m.content}
            file_refs={m.file_refs}
            tool_trace={m.tool_trace}
          />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink-muted">
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mb-2 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border bg-surface px-6 py-4">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about this project…"
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={14} />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
