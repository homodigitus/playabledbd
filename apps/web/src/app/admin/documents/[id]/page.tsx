"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { DocumentDetailResponse } from "@lumen/shared";
import { apiGet, ApiRequestError } from "@/lib/api";

export default function AdminDocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<DocumentDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiGet<DocumentDetailResponse>(`/api/admin/documents/${params.id}`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : "Failed to load document");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p className="status-message">Loading...</p>;

  const { document, chunks } = data;

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>{document.title}</h1>
        <dl>
          <Row label="Source key" value={document.sourceKey} />
          <Row label="File name" value={document.fileName} />
          <Row label="MIME type" value={document.mimeType} />
          <Row label="Status" value={document.status} />
          <Row label="Size" value={`${Math.round(document.sizeBytes / 1024)} KB`} />
          <Row label="Chunk count" value={String(document.chunkCount)} />
          <Row
            label="Last indexed"
            value={document.lastIndexedAt ? new Date(document.lastIndexedAt).toLocaleString() : "—"}
          />
          {document.errorMessage && <Row label="Error" value={document.errorMessage} />}
        </dl>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Chunks ({chunks.length})</h2>
        {chunks.map((chunk) => (
          <div key={chunk.id} className="card" style={{ background: "var(--color-surface-alt)" }}>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", margin: "0 0 0.4rem" }}>
              #{chunk.chunkIndex}
              {chunk.sectionTitle ? ` · ${chunk.sectionTitle}` : ""}
              {chunk.pageNumber ? ` · p. ${chunk.pageNumber}` : ""} · {chunk.tokenCount} tokens
            </p>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{chunk.snippet}</p>
          </div>
        ))}
        {chunks.length === 0 && <p className="status-message">No chunks for this document.</p>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.35rem" }}>
      <dt style={{ color: "var(--color-text-muted)", minWidth: 140 }}>{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}
