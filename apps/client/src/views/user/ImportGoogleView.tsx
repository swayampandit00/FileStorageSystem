import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatBytes, formatDate } from "../../api/client";

type Status = { configured: boolean; connected: boolean; email: string | null };

type GItem = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  isFolder: boolean;
};

type Listed = { files: GItem[]; nextPageToken: string | null; parentId: string };

const MSG: Record<string, string> = {
  connected: "Google Drive connected. Select files or folders to import.",
  denied: "Google permission was not granted.",
  failed: "Could not finish Google sign-in. Try again.",
  missing: "Google returned an incomplete response.",
};

export function ImportGoogleView() {
  const [params] = useSearchParams();
  const destFolderId = params.get("folderId");
  const flash = params.get("google");
  const [status, setStatus] = useState<Status | null>(null);
  const [items, setItems] = useState<GItem[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [parentId, setParentId] = useState("root");
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([{ id: "root", name: "Google Drive" }]);
  const [selected, setSelected] = useState<Map<string, GItem>>(new Map());
  const [error, setError] = useState<string | null>(flash && MSG[flash] && flash !== "connected" ? MSG[flash] : null);
  const [okMsg, setOkMsg] = useState<string | null>(flash === "connected" ? MSG.connected : null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    const s = await api<Status>("/api/google/status");
    setStatus(s);
    return s;
  }, []);

  const loadList = useCallback(async (folder: string, page?: string, append = false) => {
    const data = await api<Listed>(
      `/api/google/files?parentId=${encodeURIComponent(folder)}${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`
    );
    setItems((prev) => (append ? [...prev, ...data.files] : data.files));
    setNextPage(data.nextPageToken);
    setParentId(data.parentId);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const s = await loadStatus();
        if (s.connected) await loadList("root");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load Google Drive");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadList, loadStatus]);

  async function connect() {
    setError(null);
    try {
      const data = await api<{ url: string }>("/api/google/connect");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start Google sign-in");
    }
  }

  async function onDisconnect() {
    if (!window.confirm("Disconnect Google Drive from this account?")) return;
    await api("/api/google", { method: "DELETE" });
    setStatus({ configured: status?.configured ?? false, connected: false, email: null });
    setItems([]);
    setSelected(new Map());
    setOkMsg("Disconnected.");
  }

  function toggle(item: GItem) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }

  async function openFolder(item: GItem) {
    if (!item.isFolder) return;
    setBusy(true);
    setError(null);
    try {
      await loadList(item.id);
      setTrail((t) => [...t, { id: item.id, name: item.name }]);
      setSelected(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open folder");
    } finally {
      setBusy(false);
    }
  }

  async function jump(index: number) {
    const item = trail[index];
    setBusy(true);
    try {
      await loadList(item.id);
      setTrail(trail.slice(0, index + 1));
      setSelected(new Map());
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const result = await api<{ imported: number; folders: number; skipped: { name: string; reason: string }[] }>(
        "/api/google/import",
        {
          method: "POST",
          body: JSON.stringify({
            folderId: destFolderId,
            items: [...selected.values()].map((i) => ({ id: i.id, name: i.name, mimeType: i.mimeType })),
          }),
        }
      );
      const skip = result.skipped.length
        ? ` ${result.skipped.length} skipped: ${result.skipped
            .slice(0, 4)
            .map((s) => s.name)
            .join(", ")}`
        : "";
      setOkMsg(`Imported ${result.imported} file(s) and ${result.folders} folder(s) onto this server.${skip}`);
      setSelected(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const selCount = selected.size;
  const listed = useMemo(
    () => [...items].sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name)),
    [items]
  );

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Import from Google Drive</h2>
          <p className="muted">
            Grant Drive permission, pick files or folders, then copy them onto this server disk.
            {destFolderId ? " They will land in the folder you came from." : " They will land in My Drive."}
          </p>
        </div>
        <Link className="btn secondary" to="/app/files">
          Back to My Drive
        </Link>
      </div>

      {okMsg && <p className="ok">{okMsg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="card stack" style={{ marginBottom: 16 }}>
        <div>
          <div className="muted">Google account</div>
          <strong>
            {!status
              ? "..."
              : status.connected
                ? status.email || "Connected"
                : status.configured
                  ? "Not connected"
                  : "Not configured on this server"}
          </strong>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          MyCloud only requests read access. Bytes are copied to STORAGE_DIR; Google keeps the originals.
        </p>
        <div className="toolbar" style={{ margin: 0 }}>
          {status?.connected ? (
            <button className="btn secondary" type="button" onClick={onDisconnect}>
              Disconnect
            </button>
          ) : (
            <button className="btn" type="button" onClick={connect} disabled={!status?.configured}>
              Allow Google Drive access
            </button>
          )}
        </div>
        {status && !status.configured && (
          <p className="muted">
            Admin: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in apps/server/.env. See
            docs/SETUP.md.
          </p>
        )}
      </div>

      {status?.connected && (
        <>
          <div className="toolbar">
            <div className="muted">
              {trail.map((t, i) => (
                <span key={`${t.id}-${i}`}>
                  {i > 0 && " / "}
                  <button className="crumb" type="button" onClick={() => jump(i)}>
                    {t.name}
                  </button>
                </span>
              ))}
            </div>
            <button className="btn" type="button" disabled={busy || selCount === 0} onClick={importSelected}>
              {busy ? "Importing..." : `Import selected (${selCount})`}
            </button>
          </div>

          {loading ? (
            <p className="muted">Loading Drive...</p>
          ) : listed.length === 0 ? (
            <div className="empty">This Google Drive folder is empty.</div>
          ) : (
            <div className="dropzone">
              <div className="drive-grid">
                {listed.map((item) => {
                  const on = selected.has(item.id);
                  return (
                    <div key={item.id} className={`tile${on ? " sel" : ""}`} style={{ position: "relative" }}>
                      <label className="g-check">
                        <input type="checkbox" checked={on} onChange={() => toggle(item)} />
                      </label>
                      <button
                        type="button"
                        className="tile-hit"
                        onClick={() => (item.isFolder ? openFolder(item) : toggle(item))}
                      >
                        <span className={`tile-icon${item.isFolder ? " folder" : ""}`}>
                          {item.isFolder ? "DIR" : "G"}
                        </span>
                        <div className="tile-name">{item.name}</div>
                        <div className="tile-meta">
                          {item.isFolder
                            ? "Folder · open to browse"
                            : `${item.size ? formatBytes(Number(item.size)) : "Google file"}${
                                item.modifiedTime ? ` · ${formatDate(item.modifiedTime)}` : ""
                              }`}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {nextPage && (
            <div className="toolbar">
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                onClick={() => loadList(parentId, nextPage, true)}
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
