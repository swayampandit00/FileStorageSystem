import { useEffect, useState } from "react";
import { api, formatDate } from "../../api/client";

type EventRow = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  detail: string | null;
  created_at: string;
};

export function AdminAuditView() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<EventRow[]>("/api/admin/audit")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Audit log</h2>
          <p className="muted">Recent security-relevant actions. Secrets are never stored here.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="file-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.created_at)}</td>
                <td>{r.actor_email ?? r.actor_id ?? "system"}</td>
                <td>
                  <code>{r.action}</code>
                </td>
                <td>
                  {r.target_type} {r.target_id?.slice(0, 8)}
                </td>
                <td className="muted">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
