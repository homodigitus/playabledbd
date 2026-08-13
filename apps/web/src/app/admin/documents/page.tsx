"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DocumentListResponse, DocumentStatus } from "@lumen/shared";
import { apiGet, ApiRequestError } from "@/lib/api";

const STATUS_OPTIONS: (DocumentStatus | "")[] = ["", "PENDING", "PROCESSING", "INDEXED", "FAILED", "REMOVED"];

export default function AdminDocumentsPage() {
  const [status, setStatus] = useState<DocumentStatus | "">("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<DocumentListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (status) params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      try {
        const res = await apiGet<DocumentListResponse>(`/api/admin/documents?${params.toString()}`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : "Failed to load documents");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, search]);

  return (
    <div>
      <div className="card" style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
        <div className="form-field" style={{ margin: 0 }}>
          <label htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value as DocumentStatus | "")}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s || "all"} value={s}>
                {s || "All"}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ margin: 0, flex: 1 }}>
          <label htmlFor="search">Search</label>
          <input
            id="search"
            type="text"
            placeholder="title, filename, source key"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Chunks</th>
              <th>Size</th>
              <th>Last indexed</th>
            </tr>
          </thead>
          <tbody>
            {data?.documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <Link href={`/admin/documents/${doc.id}`}>{doc.title}</Link>
                </td>
                <td>
                  <StatusBadge status={doc.status} />
                </td>
                <td>{doc.chunkCount}</td>
                <td>{Math.round(doc.sizeBytes / 1024)} KB</td>
                <td>{doc.lastIndexedAt ? new Date(doc.lastIndexedAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.documents.length === 0 && <p className="status-message">No documents match this filter.</p>}
        {!data && !error && <p className="status-message">Loading...</p>}
        {data && <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>{data.total} total document(s)</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const variant =
    status === "INDEXED"
      ? "badge-success"
      : status === "FAILED"
        ? "badge-danger"
        : status === "REMOVED"
          ? "badge-neutral"
          : "badge-warning";
  return <span className={`badge ${variant}`}>{status}</span>;
}
