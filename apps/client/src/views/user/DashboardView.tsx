import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatBytes, formatDate, type Activity, type CloudFile, type Usage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

export function DashboardView() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [recent, setRecent] = useState<CloudFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Usage>("/api/storage/usage"),
      api<Activity[]>("/api/storage/activity"),
      api<{ files: CloudFile[] }>("/api/files?mode=recent"),
    ])
      .then(([u, a, r]) => {
        setUsage(u);
        setActivity(a);
        setRecent(r.files.slice(0, 8));
      })
      .catch((e) => setError(e.message));
  }, []);

  const pct = usage ? Math.min(100, Math.round((usage.usedBytes / Math.max(1, usage.quotaBytes)) * 100)) : 0;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Home</h2>
          <p className="muted">Welcome back, {user?.displayName}. Everything stays on this machine.</p>
        </div>
        <Link className="btn" to="/app/files">
          Go to My Drive
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid-stats">
        <div className="card stat">
          <div className="label">Used</div>
          <div className="value">{usage ? formatBytes(usage.usedBytes) : "..."}</div>
        </div>
        <div className="card stat">
          <div className="label">Quota</div>
          <div className="value">{usage ? formatBytes(usage.quotaBytes) : "..."}</div>
        </div>
        <div className="card stat">
          <div className="label">Free</div>
          <div className="value">{usage ? formatBytes(usage.remainingBytes) : "..."}</div>
        </div>
        <div className="card stat">
          <div className="label">Fill</div>
          <div className="value">{pct}%</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="muted">Storage</p>
        <div className="progress" style={{ marginTop: 10 }}>
          <span style={{ width: `${pct}%` }} />
        </div>
        {usage?.breakdown && usage.breakdown.length > 0 && (
          <div className="chips" style={{ marginTop: 14 }}>
            {usage.breakdown.map((b) => (
              <span className="chip" key={b.category}>
                {b.category}: {formatBytes(b.bytes)} ({b.count})
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="two-col">
        <div className="card">
          <h3>Suggested</h3>
          {recent.length === 0 ? (
            <p className="muted">Upload a file to see recents here.</p>
          ) : (
            <ul className="plain">
              {recent.map((f) => (
                <li key={f.id}>
                  <Link to="/app/recent">{f.displayName}</Link>
                  <span className="muted"> · {formatBytes(f.sizeBytes)} · {formatDate(f.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h3>Activity</h3>
          {activity.length === 0 ? (
            <p className="muted">No recent activity.</p>
          ) : (
            <ul className="plain">
              {activity.slice(0, 10).map((a) => (
                <li key={a.id}>
                  {a.action} {a.detail ? `— ${a.detail}` : ""}
                  <span className="muted"> · {formatDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
