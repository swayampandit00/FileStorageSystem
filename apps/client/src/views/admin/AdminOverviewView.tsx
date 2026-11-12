import { useEffect, useState } from "react";
import { api, formatBytes } from "../../api/client";

type Stats = {
  users: number;
  files: number;
  trashed: number;
  bytes: number;
  shares: number;
  collabs: number;
  breakdown: { category: string; count: number; bytes: number }[];
  topUsers: {
    id: string;
    email: string;
    display_name: string;
    quota_bytes: number;
    used_bytes: number;
    file_count: number;
  }[];
};

export function AdminOverviewView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/api/admin/stats")
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Admin overview</h2>
          <p className="muted">Disk usage across all accounts. Files never leave this machine.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid-stats">
        <div className="card stat">
          <div className="label">Users</div>
          <div className="value">{stats?.users ?? "..."}</div>
        </div>
        <div className="card stat">
          <div className="label">Files</div>
          <div className="value">{stats?.files ?? "..."}</div>
        </div>
        <div className="card stat">
          <div className="label">Stored</div>
          <div className="value">{stats ? formatBytes(stats.bytes) : "..."}</div>
        </div>
        <div className="card stat">
          <div className="label">Trash / links / people</div>
          <div className="value" style={{ fontSize: 16 }}>
            {stats ? `${stats.trashed} · ${stats.shares} · ${stats.collabs}` : "..."}
          </div>
        </div>
      </div>
      <div className="two-col">
        <div className="card">
          <h3>By type</h3>
          {!stats?.breakdown?.length ? (
            <p className="muted">No files yet.</p>
          ) : (
            <ul className="plain">
              {stats.breakdown.map((b) => (
                <li key={b.category}>
                  {b.category}: {formatBytes(b.bytes)} ({b.count})
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h3>Top storage users</h3>
          {!stats?.topUsers?.length ? (
            <p className="muted">No usage yet.</p>
          ) : (
            <ul className="plain">
              {stats.topUsers.map((u) => (
                <li key={u.id}>
                  {u.display_name} ({u.email}) — {formatBytes(u.used_bytes)} / {formatBytes(u.quota_bytes)} · {u.file_count} files
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
