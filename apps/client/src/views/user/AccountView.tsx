import { FormEvent, useEffect, useState } from "react";
import { api, formatBytes, type Usage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

export function AccountView() {
  const { user, refreshMe } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Usage>("/api/storage/usage").then(setUsage).catch(() => undefined);
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      const body: Record<string, string> = { displayName };
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }
      await api("/api/auth/me", { method: "PATCH", body: JSON.stringify(body) });
      await refreshMe();
      setCurrentPassword("");
      setNewPassword("");
      setMsg("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Settings</h2>
          <p className="muted">Profile, password, and quota for this login.</p>
        </div>
      </div>
      <div className="two-col">
        <form className="card stack" onSubmit={onSave}>
          <label className="stack">
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} required />
          </label>
          <div>
            <div className="muted">Email</div>
            <strong>{user?.email}</strong>
          </div>
          <label className="stack">
            Current password (only to change password)
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
          <label className="stack">
            New password
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={10} />
          </label>
          {msg && <p className="ok">{msg}</p>}
          {error && <p className="error">{error}</p>}
          <button className="btn">Save</button>
        </form>
        <div className="card stack">
          <div>
            <div className="muted">Role</div>
            <span className={`badge ${user?.role === "admin" ? "admin" : ""}`}>{user?.role}</span>
          </div>
          <div>
            <div className="muted">Quota</div>
            <strong>{usage ? `${formatBytes(usage.usedBytes)} / ${formatBytes(usage.quotaBytes)}` : "..."}</strong>
          </div>
          {usage?.breakdown?.map((b) => (
            <div key={b.category} className="muted">
              {b.category}: {formatBytes(b.bytes)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
