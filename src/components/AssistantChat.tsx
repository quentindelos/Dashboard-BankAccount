"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { RESET_MARKER, type AssistantProvider, type ChatMessage } from "@/lib/assistantShared";

const STORAGE_KEY = "assistant-conversation";

const SUGGESTIONS = [
  "Mon portefeuille est-il bien diversifié ?",
  "Que faire de mon Livret Jeune avant fin 2029 ?",
  "Comment répartir l'épargne en plus après mon CDI ?",
  "Mon matelas de sécurité est-il suffisant ?",
  "Quelles charges pourrais-je réduire ?",
  "PEA ou CTO pour mes prochains achats ?",
];

const PROVIDER_LABEL: Record<AssistantProvider, string> = {
  gemini: "Gemini (Google)",
  claude: "Claude (Anthropic)",
};

export default function AssistantChat({ provider }: { provider: AssistantProvider | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the conversation when moving between pages (this browser only).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) setMessages(saved.filter((m) => m?.content));
    } catch {
      // nothing saved
    }
  }, []);
  useEffect(() => {
    if (busy) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // storage unavailable
    }
  }, [messages, busy]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setError("");
    setInput("");
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Keep the last 20 exchanges to bound the cost of long conversations.
        body: JSON.stringify({ messages: history.slice(-40) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error === "missing_key" ? "La clé API n'est pas configurée." : data.error ?? "Erreur du serveur.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        const reset = answer.lastIndexOf(RESET_MARKER);
        if (reset >= 0) answer = answer.slice(reset + RESET_MARKER.length);
        setMessages([...history, { role: "assistant", content: answer }]);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        answer += answer ? "\n\n_(Arrêté.)_" : "";
      } else {
        setError(err instanceof Error ? err.message : "Erreur.");
      }
    } finally {
      // Drop an empty answer so the question can be asked again.
      setMessages(answer ? [...history, { role: "assistant", content: answer }] : history.slice(0, -1));
      if (!answer) setInput(text);
      setBusy(false);
      abortRef.current = null;
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setError("");
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Conseiller</h1>
          <p className="muted">Pose tes questions : il connaît tes comptes, tes positions, ton budget et ta projection.</p>
        </div>
        {messages.length > 0 && (
          <button type="button" className="btn" onClick={reset}>
            Nouvelle conversation
          </button>
        )}
      </div>

      {!provider ? (
        <div className="card">
          <h2>À configurer</h2>
          <p className="secondary">Le conseiller a besoin d'une clé API, au choix :</p>
          <ul className="secondary setup-list">
            <li>
              <strong>Gemini</strong> : dans la{" "}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
                console Google Cloud
              </a>
              , ouvre un projet où la facturation est activée, puis <em>Identifiants → Créer des identifiants → Clé API</em>{" "}
              et limite-la à « Generative Language API ».
              <pre className="code-block">GEMINI_API_KEY=&quot;AIza...&quot;</pre>
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
        <section className="card chat">
          <div className="chat-log" aria-live="polite">
            {messages.length === 0 && (
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
                  {m.content ? <Markdown text={m.content} /> : <span className="chat-thinking">Réflexion…</span>}
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
      )}
    </>
  );
}

// Minimal Markdown: paragraphs, bullet and numbered lists, ### headings,
// **bold**, _italic_ and `code`. Rendered as React elements, never as HTML.
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
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
