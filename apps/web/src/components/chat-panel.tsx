"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { AskResponse, RetrievalMode } from "@lumen/shared";
import { apiPost, ApiRequestError } from "@/lib/api";

type Turn = {
  id: string;
  question: string;
  response: AskResponse | null;
  error: string | null;
};

let turnCounter = 0;

export function ChatPanel() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<RetrievalMode>("hybrid");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const question = query.trim();
    if (!question || pending) return;

    turnCounter += 1;
    const id = `turn-${turnCounter}`;
    setTurns((prev) => [...prev, { id, question, response: null, error: null }]);
    setQuery("");
    setPending(true);

    try {
      const response = await apiPost<AskResponse>("/api/ask", { query: question, mode });
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, response } : t)));
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.";
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, error: message } : t)));
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Ask the Lumen Playables corpus</h1>
          <p style={{ color: "var(--color-text-muted)", margin: "0.25rem 0 0" }}>
            Answers are grounded in indexed documents. Citations are shown for every answer.
          </p>
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label htmlFor="mode">Retrieval mode</label>
          <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as RetrievalMode)}>
            <option value="hybrid">Hybrid</option>
            <option value="vector">Vector only</option>
          </select>
        </div>
      </div>

      <div className="chat-thread">
        {turns.map((turn) => (
          <ChatTurn key={turn.id} turn={turn} />
        ))}
        {turns.length === 0 && (
          <p className="status-message">Ask a question about Lumen Playables&apos; products, policies, or docs.</p>
        )}
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          placeholder="e.g. What ad formats does the Playables SDK support?"
          onChange={(e) => setQuery(e.target.value)}
          disabled={pending}
        />
        <button type="submit" className="btn-primary" disabled={pending || query.trim().length === 0}>
          {pending ? "Thinking..." : "Ask"}
        </button>
      </form>
    </div>
  );
}

function ChatTurn({ turn }: { turn: Turn }) {
  return (
    <>
      <div className="chat-turn-question">{turn.question}</div>
      {turn.error && <div className="error-banner">{turn.error}</div>}
      {turn.response && (
        <div className="chat-turn-answer">
          <StatusBadge status={turn.response.status} />
          <p style={{ whiteSpace: "pre-wrap" }}>{turn.response.answer}</p>
          {turn.response.citations.length > 0 && (
            <div className="citation-list">
              <strong>Sources</strong>
              {turn.response.citations.map((c) => (
                <div key={`${turn.id}-${c.id}`} className="citation-item">
                  [{c.id}] {c.documentTitle}
                  {c.sectionTitle ? ` — ${c.sectionTitle}` : ""}
                  {c.pageNumber ? ` (p. ${c.pageNumber})` : ""}
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 0 }}>
            {turn.response.latencyMs}ms · {turn.response.results.length} chunks retrieved
          </p>
        </div>
      )}
      {!turn.response && !turn.error && <div className="chat-turn-answer status-message">Thinking...</div>}
    </>
  );
}

function StatusBadge({ status }: { status: AskResponse["status"] }) {
  if (status === "answered") return <span className="badge badge-success">Answered</span>;
  return <span className="badge badge-warning">Insufficient context</span>;
}
