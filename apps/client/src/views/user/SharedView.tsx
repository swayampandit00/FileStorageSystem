import { useEffect, useState } from "react";
import { api, formatBytes, formatDate, type ShareItem } from "../../api/client";

export function SharedView() {
  const [items, setItems] = useState<ShareItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setItems(await api<ShareItem[]>("/api/shares"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load shares");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(id: string) {
    if (!window.confirm("Revoke this share link?")) return;
    try {
      await api(`/api/shares/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Shared files</h2>
          <p className="muted">Links you created. Revoke anytime.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {items.length === 0 ? (
          <div className="empty">You have not created any share links yet.</div>
        ) : (
          <table className="file-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Downloads</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.fileName} {s.sizeBytes != null ? `(${formatBytes(s.sizeBytes)})` : ""}
                  </td>
                  <td>{formatDate(s.createdAt)}</td>
                  <td>{s.expiresAt ? formatDate(s.expiresAt) : "Never"}</td>
                  <td>
                    {s.downloadCount}
                    {s.maxDownloads != null ? ` / ${s.maxDownloads}` : ""}
                  </td>
                  <td>
                    <span className={`badge ${s.revoked ? "disabled" : ""}`}>{s.revoked ? "revoked" : "active"}</span>
                    {s.hasPassword && <span className="badge">password</span>}
                  </td>
                  <td>
                    {!s.revoked && (
                      <button className="btn danger" type="button" onClick={() => revoke(s.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
