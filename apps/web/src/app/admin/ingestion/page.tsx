"use client";

import { useCallback, useEffect, useState } from "react";
import type { IngestionRunDto, IngestionRunListResponse } from "@lumen/shared";
import { apiGet, apiPost, ApiRequestError } from "@/lib/api";

export default function AdminIngestionPage() {
  const [runs, setRuns] = useState<IngestionRunDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<IngestionRunListResponse>("/api/admin/ingestion");
      setRuns(res.runs);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load ingestion runs");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTrigger = async () => {
    setTriggering(true);
    setError(null);
    try {
      await apiPost<{ run: IngestionRunDto }>("/api/admin/ingestion");
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to trigger ingestion");
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Ingestion runs</h1>
          <p style={{ color: "var(--color-text-muted)", margin: "0.25rem 0 0" }}>
            Reindexes the corpus from the server-configured CORPUS_ROOT. Only one run can be active at a time.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={handleTrigger} disabled={triggering}>
          {triggering ? "Starting..." : "Trigger ingestion"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Started</th>
              <th>Finished</th>
              <th>Seen</th>
              <th>Indexed</th>
              <th>Skipped</th>
              <th>Failed</th>
              <th>Chunks</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>
                  <RunStatusBadge status={run.status} />
                </td>
                <td>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</td>
                <td>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "—"}</td>
                <td>{run.documentsSeen}</td>
                <td>{run.documentsIndexed}</td>
                <td>{run.documentsSkipped}</td>
                <td>{run.documentsFailed}</td>
                <td>{run.chunksCreated}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && <p className="status-message">No ingestion runs yet.</p>}
      </div>
    </div>
  );
}

function RunStatusBadge({ status }: { status: IngestionRunDto["status"] }) {
  const variant =
    status === "SUCCEEDED"
      ? "badge-success"
      : status === "FAILED"
        ? "badge-danger"
        : status === "PARTIAL"
          ? "badge-warning"
          : "badge-neutral";
  return <span className={`badge ${variant}`}>{status}</span>;
}
