"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  DETAIL_LABEL,
  PROVIDER_LABEL,
  RISK_LABEL,
  THINKING_LABEL,
  modelLabel,
  type ChatMessage,
  type StreamEvent,
} from "@/lib/assistantShared";
import AssistantSettingsPanel, { type AssistantInfo } from "@/components/AssistantSettingsPanel";

/** Where the previous version of the page kept its single conversation. */
const LEGACY_STORAGE_KEY = "assistant-conversation";

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function when(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? timeFormat.format(d) : dayFormat.format(d);
}

const SUGGESTIONS = [
  "Quels montages fiscaux me conseilles-tu cette année ?",
  "Comment préparer ma fiscalité avant mon CDI fin 2027 ?",
  "Analyse la performance de chaque compte et de mes lignes",
  "Comment rééquilibrer mon portefeuille sans payer d'impôt ?",
  "PER, assurance vie ou PEA : où verser en priorité ?",
  "Que faire de mon Livret Jeune avant fin 2029 ?",
  "Mon matelas de sécurité est-il suffisant ?",
  "Comment profiter au mieux de l'épargne salariale Thales ?",
];

export default function AssistantChat({ initial }: { initial: AssistantInfo }) {
  const [info, setInfo] = useState(initial);
  const [showSettings, setShowSettings] = useState(false);
  const { provider, settings } = info;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [memoryVersion, setMemoryVersion] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/conversations", { cache: "no-store" });
      if (res.ok) setConversations((await res.json()).conversations);
    } catch {
      // keep the current list
    }
  }, []);

  // Load the history. A conversation kept in this browser by the previous
  // version of the page is moved to the server once.
  useEffect(() => {
    (async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? "[]");
        if (Array.isArray(saved) && saved.length >= 2) {
          const res = await fetch("/api/assistant/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: saved.filter((m) => m?.content).slice(-200) }),
          });
          if (res.ok) localStorage.removeItem(LEGACY_STORAGE_KEY);
        } else {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      } catch {
        // storage unavailable or nothing to move
      }
      refreshList();
    })();
  }, [refreshList]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function open(id: string) {
    if (busy || id === activeId) return;
    setLoading(true);
    setError("");
    setShowHistory(false);
    try {
      const res = await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Conversation introuvable.");
      const { conversation } = await res.json();
      setActiveId(conversation.id);
      setMessages(conversation.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
      refreshList();
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Supprimer cette conversation ? Ce que le conseiller a mémorisé est conservé.")) return;
    await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    if (id === activeId) startNew();
    refreshList();
  }

  function startNew() {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setError("");
    setShowHistory(false);
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setError("");
    setInput("");
    const before = messages;
    let answer: ChatMessage = { role: "assistant", content: "" };
    const show = () => setMessages([...before, { role: "user", content: text }, answer]);
    show();
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: text }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error === "missing_key" ? "La clé API n'est pas configurée." : (data.error ?? "Erreur du serveur."));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.t === "conversation") setActiveId(event.id);
          else if (event.t === "text") answer = { ...answer, content: answer.content + event.v };
          else if (event.t === "reset") answer = { ...answer, content: "" };
          else if (event.t === "note") {
            answer = { ...answer, notes: [...(answer.notes ?? []), event.v] };
            if (event.kind === "memory") setMemoryVersion((v) => v + 1);
          } else if (event.t === "error") setError(event.v);
        }
        show();
      }
    } catch (err) {
      if (controller.signal.aborted) {
        if (answer.content) answer = { ...answer, content: `${answer.content}\n\n_(Arrêté.)_` };
      } else {
        setError(err instanceof Error ? err.message : "Erreur.");
      }
    } finally {
      const answered = Boolean(answer.content || answer.notes?.length);
      // Without an answer, the question goes back in the box to be asked again.
      setMessages(answered ? [...before, { role: "user", content: text }, answer] : before);
      if (!answered) {
        setInput(text);
        if (before.length === 0) setActiveId(null);
      }
      setBusy(false);
      abortRef.current = null;
      refreshList();
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Conseiller</h1>
          <p className="muted">
            Ton conseiller patrimonial : fiscalité, enveloppes, allocation et performance, à partir de tes vrais chiffres.
          </p>
        </div>
        {provider && (
          <button type="button" className="btn btn-primary" onClick={startNew} disabled={!activeId && messages.length === 0}>
            Nouvelle conversation
          </button>
        )}
      </div>

      {provider && info.model && (
        <section className="card agent-card">
          <div className="agent-id">
            <div className="agent-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" />
                <path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
              </svg>
            </div>
            <div>
              <div className="agent-name">
                Conseiller patrimonial <span className="agent-status">actif</span>
              </div>
              <div className="muted agent-model">
                {modelLabel(info.model)} ·{" "}
                {provider === "gemini" ? (info.vertex ? "Vertex AI (Google Cloud)" : "API Gemini") : PROVIDER_LABEL[provider]}
              </div>
            </div>
          </div>
          <ul className="agent-badges" aria-label="Paramètres actuels">
            <li className="pill">Réflexion {THINKING_LABEL[settings.thinking].toLowerCase()}</li>
            <li className="pill">{settings.webSearch ? "Recherche web activée" : "Sans recherche web"}</li>
            <li className="pill">Profil {RISK_LABEL[settings.risk].toLowerCase()}</li>
            <li className="pill">{settings.tmi != null ? `TMI ${settings.tmi} %` : "TMI estimée"}</li>
            <li className="pill">Réponses {DETAIL_LABEL[settings.detail].toLowerCase()}</li>
          </ul>
          <button
            type="button"
            className={showSettings ? "btn btn-primary" : "btn"}
            aria-expanded={showSettings}
            onClick={() => setShowSettings((s) => !s)}
          >
            Paramètres
          </button>
        </section>
      )}

      {provider && showSettings && (
        <AssistantSettingsPanel
          info={info}
          memoryVersion={memoryVersion}
          onSaved={setInfo}
          onClose={() => setShowSettings(false)}
        />
      )}

      {!provider ? (
        <div className="card">
          <h2>À configurer</h2>
          <p className="secondary">Le conseiller a besoin d'une clé API, au choix :</p>
          <ul className="secondary setup-list">
            <li>
              <strong>Gemini</strong> : dans la{" "}
              <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">
                console Google Cloud
              </a>
              , dans un projet où la facturation est activée : <em>Agent Platform → Clés API → Créer une clé API</em>,
              restreinte à « API Agent Platform ».
              <pre className="code-block">
                GEMINI_API_KEY=&quot;...&quot;{"\n"}GEMINI_VERTEX=&quot;true&quot;
              </pre>
            </li>
            <li>
              <strong>Claude</strong> : crée une clé sur{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>
              .
              <pre className="code-block">ANTHROPIC_API_KEY=&quot;sk-ant-...&quot;</pre>
            </li>
          </ul>
          <p className="secondary" style={{ marginBottom: 0 }}>
            Ajoute la ligne dans le fichier <code>.env</code>, puis redémarre l'application (
            <code>docker compose up -d</code> sur le Raspberry). Compte quelques centimes par question.
          </p>
        </div>
      ) : (
        <div className="assistant-layout">
        <aside className={showHistory ? "card chat-history open" : "card chat-history"} aria-label="Conversations précédentes">
          <button
            type="button"
            className="chat-history-toggle"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((s) => !s)}
          >
            Conversations ({conversations.length})
          </button>
          <h2 className="chat-history-title">Conversations</h2>
          {conversations.length === 0 ? (
            <p className="muted chat-history-empty">Tes conversations apparaîtront ici.</p>
          ) : (
            <ul className="chat-history-list">
              {conversations.map((c) => (
                <li key={c.id} className={c.id === activeId ? "active" : undefined}>
                  <button type="button" className="chat-history-item" onClick={() => open(c.id)} disabled={busy}>
                    <span className="chat-history-name">{c.title}</span>
                    <span className="muted chat-history-date">{when(c.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="chat-history-delete"
                    aria-label={`Supprimer « ${c.title} »`}
                    title="Supprimer"
                    onClick={() => remove(c.id)}
                    disabled={busy}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="card chat">
          <div className="chat-log" aria-live="polite">
            {loading && <p className="muted">Chargement…</p>}
            {messages.length === 0 && !loading && (
              <div className="chat-empty">
                <p className="muted">Quelques idées pour commencer :</p>
                <div className="chat-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="chip-btn" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="chat-msg user">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="chat-msg assistant">
                  {m.notes?.map((n, j) => (
                    <p key={j} className="chat-memory-note">
                      {n}
                    </p>
                  ))}
                  {m.content ? (
                    <Markdown text={m.content} />
                  ) : busy && i === messages.length - 1 ? (
                    <span className="chat-thinking">{settings.webSearch ? "Analyse et recherche web…" : "Analyse de ta situation…"}</span>
                  ) : null}
                </div>
              )
            )}
            <div ref={endRef} />
          </div>

          {error && <p className="error-text">{error}</p>}

          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              placeholder="Ta question…"
              rows={2}
              maxLength={8000}
              aria-label="Ta question"
            />
            {busy ? (
              <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
                Arrêter
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={!input.trim()}>
                Envoyer
              </button>
            )}
          </form>
          <p className="muted chat-note">
            Réponses de {PROVIDER_LABEL[provider]} : tes données du jour lui sont envoyées avec chaque question. Ce ne sont
            pas des conseils en investissement réglementés : vérifie avant d'agir.
          </p>
        </section>
        </div>
      )}
    </>
  );
}

// Minimal Markdown: paragraphs, bullet and numbered lists, ### headings,
// **bold**, _italic_, `code` and https links. Rendered as React elements,
// never as HTML.
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };

  for (const raw of lines) {
    const lineText = raw.trimEnd();
    const bullet = lineText.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = lineText.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = lineText.match(/^#{1,4}\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (heading) {
      flushPara();
      flushList();
      blocks.push(<h3 key={blocks.length}>{inline(heading[1])}</h3>);
    } else if (lineText.trim() === "") {
      flushPara();
      flushList();
    } else if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${lineText.trim()}`;
    } else {
      flushList();
      para.push(lineText.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="md">{blocks}</div>;
}

function inline(text: string): ReactNode {
  const parts = text.split(/(\[[^\]]+\]\(https:\/\/[^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g);
  return parts.map((p, i) => {
    const link = p.match(/^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer noopener">
          {link[1]}
        </a>
      );
    }
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
