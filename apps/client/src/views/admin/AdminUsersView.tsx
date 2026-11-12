import { useEffect, useState } from "react";
import { api, formatBytes, type User } from "../../api/client";

type AdminUser = User & { usedBytes: number };

export function AdminUsersView() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(query = q) {
    try {
      const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      setUsers(await api<AdminUser[]>(`/api/admin/users${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }

  useEffect(() => {
    load("");
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Users</h2>
          <p className="muted">Search, set quota, disable accounts. Role changes are logged.</p>
        </div>
      </div>
      <div className="toolbar">
        <input placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn secondary" type="button" onClick={() => load()}>
          Search
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="file-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Usage</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.displayName}</strong>
                  <br />
                  <span className="muted">{u.email}</span>
                </td>
                <td>
                  <span className={`badge ${u.role === "admin" ? "admin" : ""}`}>{u.role}</span>
                </td>
                <td>
                  <span className={`badge ${u.status === "disabled" ? "disabled" : ""}`}>{u.status}</span>
                </td>
                <td>
                  {formatBytes(u.usedBytes)} / {formatBytes(u.quotaBytes)}
                </td>
                <td className="row-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      const gb = window.prompt("Quota in GB", String(Math.round(u.quotaBytes / (1024 ** 3)) || 1));
                      if (!gb) return;
                      const n = Number(gb);
                      if (!Number.isFinite(n) || n <= 0) return;
                      patch(u.id, { quotaBytes: Math.round(n * 1024 ** 3) });
                    }}
                  >
                    Quota
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => patch(u.id, { status: u.status === "active" ? "disabled" : "active" })}
                  >
                    {u.status === "active" ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
