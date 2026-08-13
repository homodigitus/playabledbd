"use client";

import { useEffect, useState } from "react";
import type { RecentSearchesResponse, StatsOverviewResponse } from "@lumen/shared";
import { apiGet, ApiRequestError } from "@/lib/api";

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<StatsOverviewResponse | null>(null);
  const [recent, setRecent] = useState<RecentSearchesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [statsRes, recentRes] = await Promise.all([
          apiGet<StatsOverviewResponse>("/api/admin/stats/overview"),
          apiGet<RecentSearchesResponse>("/api/admin/stats/recent-searches")
        ]);
        if (!cancelled) {
          setStats(statsRes);
          setRecent(recentRes);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : "Failed to load stats");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!stats) return <p className="status-message">Loading...</p>;

  return (
    <div>
      <div className="stats-grid">
        <Stat label="Documents indexed" value={stats.documents.indexed} />
        <Stat label="Documents failed" value={stats.documents.failed} />
        <Stat label="Documents pending" value={stats.documents.pending} />
        <Stat label="Total chunks" value={stats.chunks.total} />
        <Stat label="Searches (24h)" value={stats.search.last24h} />
        <Stat label="Searches (7d)" value={stats.search.last7d} />
        <Stat label="Avg latency (ms)" value={Math.round(stats.search.avgLatencyMs)} />
        <Stat label="p95 latency (ms)" value={Math.round(stats.search.p95LatencyMs)} />
        <Stat
          label="Insufficient-context rate"
          value={`${Math.round(stats.search.insufficientContextRate * 100)}%`}
        />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>System readiness</h2>
        <p>
          Database: <ReadinessBadge ok={stats.readiness.databaseOk} /> &nbsp; pgvector:{" "}
          <ReadinessBadge ok={stats.readiness.pgvectorOk} />
        </p>
        {stats.lastIngestion && (
          <p style={{ color: "var(--color-text-muted)" }}>
            Last ingestion run: {stats.lastIngestion.status}
            {stats.lastIngestion.finishedAt ? ` at ${new Date(stats.lastIngestion.finishedAt).toLocaleString()}` : ""}
          </p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Recent searches</h2>
        <table>
          <thead>
            <tr>
              <th>Query</th>
              <th>Mode</th>
              <th>Results</th>
              <th>Latency</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {recent?.searches.map((s) => (
              <tr key={s.id}>
                <td>{s.query}</td>
                <td>{s.retrievalMode}</td>
                <td>{s.resultCount}</td>
                <td>{s.latencyMs}ms</td>
                <td>{s.answerStatus}</td>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {recent && recent.searches.length === 0 && <p className="status-message">No searches yet.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ReadinessBadge({ ok }: { ok: boolean }) {
  return <span className={`badge ${ok ? "badge-success" : "badge-danger"}`}>{ok ? "OK" : "Down"}</span>;
}
