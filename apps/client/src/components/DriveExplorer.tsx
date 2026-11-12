import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  fileGlyph,
  formatBytes,
  formatDate,
  previewUrl,
  saveBlob,
  versionPreviewUrl,
  type CloudFile,
  type FileVersion,
  type Folder,
  type FolderNode,
} from "../api/client";

export type DriveMode = "drive" | "starred" | "recent" | "trash";

type Props = {
  mode: DriveMode;
  title: string;
  subtitle: string;
};

type PreviewState = { file: CloudFile; url: string; text?: string } | null;

export function DriveExplorer({ mode, title, subtitle }: Props) {
  const navigate = useNavigate();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [trail, setTrail] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "My Drive" }]);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"name" | "date" | "size">("name");
  const [selected, setSelected] = useState<{ files: Set<string>; folders: Set<string> }>({
    files: new Set(),
    folders: new Set(),
  });
  const [dropOver, setDropOver] = useState(false);
  const [shareFor, setShareFor] = useState<CloudFile | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [collabFor, setCollabFor] = useState<CloudFile | Folder | null>(null);
  const [collabKind, setCollabKind] = useState<"file" | "folder">("file");
  const [collabs, setCollabs] = useState<{ id: string; email: string; display_name: string; permission: string }[]>([]);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [versionsFor, setVersionsFor] = useState<CloudFile | null>(null);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const replaceInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("mode", mode);
      if (mode === "drive" && folderId) params.set("folderId", folderId);
      if (q.trim()) params.set("q", q.trim());
      const data = await api<{ files: CloudFile[]; folders: Folder[] }>(`/api/files?${params.toString()}`);
      setFiles(data.files);
      setFolders(data.folders);
      setSelected({ files: new Set(), folders: new Set() });
      if (mode === "drive") {
        const t = await api<FolderNode[]>("/api/folders/tree");
        setTree(t);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load files");
    }
  }, [folderId, mode, q]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedFiles = useMemo(() => {
    const copy = [...files];
    copy.sort((a, b) => {
      if (sort === "size") return b.sizeBytes - a.sizeBytes;
      if (sort === "date") return b.updatedAt.localeCompare(a.updatedAt);
      return a.displayName.localeCompare(b.displayName);
    });
    return copy;
  }, [files, sort]);

  const sortedFolders = useMemo(() => {
    const copy = [...folders];
    copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }, [folders]);

  async function uploadFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    if (!arr.length) return;
    const fd = new FormData();
    for (const f of arr) fd.append("file", f);
    if (folderId) fd.append("folderId", folderId);
    setBusy(true);
    setProgress(15);
    setError(null);
    try {
      await api("/api/files/upload", { method: "POST", body: fd });
      setProgress(100);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 600);
    }
  }

  function openFolder(folder: Folder) {
    if (mode !== "drive") return;
    setFolderId(folder.id);
    setTrail((t) => [...t, { id: folder.id, name: folder.name }]);
    setQ("");
  }

  function jump(index: number) {
    const item = trail[index];
    setTrail(trail.slice(0, index + 1));
    setFolderId(item.id);
    setQ("");
  }

  async function bulk(action: "trash" | "restore" | "star" | "unstar" | "purge") {
    if (selected.files.size + selected.folders.size === 0) return;
    try {
      await api("/api/files/bulk", {
        method: "POST",
        body: JSON.stringify({
          action,
          fileIds: [...selected.files],
          folderIds: [...selected.folders],
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function toggleStar(kind: "file" | "folder", id: string, starred: boolean) {
    const path = kind === "file" ? `/api/files/${id}/star` : `/api/folders/${id}/star`;
    await api(path, { method: "POST", body: JSON.stringify({ starred: !starred }) });
    await load();
  }

  async function renameItem(kind: "file" | "folder", id: string, current: string) {
    const name = window.prompt("Rename", current);
    if (!name) return;
    if (kind === "file") await api(`/api/files/${id}`, { method: "PATCH", body: JSON.stringify({ displayName: name }) });
    else await api(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    await load();
  }

  async function copyFile(id: string) {
    await api(`/api/files/${id}/copy`, { method: "POST", body: JSON.stringify({ folderId }) });
    await load();
  }

  async function moveSelected() {
    const dest = moveTarget === "" ? null : moveTarget;
    try {
      for (const id of selected.files) {
        await api(`/api/files/${id}`, { method: "PATCH", body: JSON.stringify({ folderId: dest }) });
      }
      for (const id of selected.folders) {
        await api(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify({ parentId: dest }) });
      }
      setMoveTarget("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move failed");
    }
  }

  async function openPreview(file: CloudFile) {
    try {
      const res = await fetch(previewUrl(file.id), {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("mc_access") ?? ""}` },
        credentials: "include",
      });
      if (!res.ok) {
        setError("Preview not available. Try download.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      let text: string | undefined;
      if (file.mimeType.startsWith("text/") || file.mimeType === "application/json") {
        text = await blob.text();
      }
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview({ file, url, text });
    } catch {
      setError("Preview failed");
    }
  }

  async function openVersions(file: CloudFile) {
    setVersionsFor(file);
    try {
      const data = await api<{ current: CloudFile; versions: FileVersion[] }>(`/api/files/${file.id}/versions`);
      setVersions(data.versions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load versions");
    }
  }

  async function restoreVersion(fileId: string, versionId: string) {
    if (!window.confirm("Restore this version? The current file is saved as a new version first.")) return;
    try {
      await api(`/api/files/${fileId}/versions/${versionId}/restore`, { method: "POST" });
      await load();
      if (versionsFor) await openVersions(versionsFor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    }
  }

  async function replaceCurrent(list: FileList | File[]) {
    const arr = Array.from(list);
    if (!arr.length || !versionsFor) return;
    const fd = new FormData();
    fd.append("file", arr[0]);
    setBusy(true);
    setError(null);
    try {
      await api(`/api/files/${versionsFor.id}/replace`, { method: "POST", body: fd });
      await load();
      await openVersions(versionsFor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setBusy(false);
    }
  }

  async function previewVersion(file: CloudFile, version: FileVersion) {
    try {
      const res = await fetch(versionPreviewUrl(file.id, version.id), {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("mc_access") ?? ""}` },
        credentials: "include",
      });
      if (!res.ok) {
        setError("Preview not available. Try download.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      let text: string | undefined;
      if (version.mimeType.startsWith("text/") || version.mimeType === "application/json") {
        text = await blob.text();
      }
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview({
        file: { ...file, displayName: `${file.displayName} (v${version.versionNumber})`, mimeType: version.mimeType, sizeBytes: version.sizeBytes },
        url,
        text,
      });
    } catch {
      setError("Preview failed");
    }
  }

  async function openCollab(item: CloudFile | Folder, kind: "file" | "folder") {
    setCollabFor(item);
    setCollabKind(kind);
    const path = kind === "file" ? `/api/files/${item.id}/collaborators` : `/api/folders/${item.id}/collaborators`;
    setCollabs(await api(path));
  }

  async function addCollab(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!collabFor) return;
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "");
    const permission = String(fd.get("permission") || "viewer");
    const path = collabKind === "file" ? `/api/files/${collabFor.id}/collaborators` : `/api/folders/${collabFor.id}/collaborators`;
    try {
      await api(path, { method: "POST", body: JSON.stringify({ email, permission }) });
      await openCollab(collabFor, collabKind);
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share");
    }
  }

  async function createShare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!shareFor) return;
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    const hours = Number(fd.get("hours") || 0);
    const maxDownloads = Number(fd.get("maxDownloads") || 0);
    const body: Record<string, unknown> = {};
    if (password) body.password = password;
    if (hours > 0) body.expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    if (maxDownloads > 0) body.maxDownloads = maxDownloads;
    try {
      const data = await api<{ share: { token?: string } }>(`/api/files/${shareFor.id}/share`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setShareToken(data.share.token ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Share failed");
    }
  }

  const selCount = selected.files.size + selected.folders.size;
  const inTrash = mode === "trash";

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{title}</h2>
          <p className="muted">
            {mode === "drive"
              ? trail.map((t, i) => (
                  <span key={`${t.id}-${i}`}>
                    {i > 0 && " / "}
                    <button className="crumb" type="button" onClick={() => jump(i)}>
                      {t.name}
                    </button>
                  </span>
                ))
              : subtitle}
          </p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button className={`btn ghost ${view === "grid" ? "on" : ""}`} type="button" onClick={() => setView("grid")}>
            Grid
          </button>
          <button className={`btn ghost ${view === "list" ? "on" : ""}`} type="button" onClick={() => setView("list")}>
            List
          </button>
        </div>
      </div>

      <div className="toolbar">
        {mode === "drive" && (
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button className="btn" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? "Uploading..." : "New upload"}
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={async () => {
                const name = window.prompt("Folder name");
                if (!name) return;
                await api("/api/folders", { method: "POST", body: JSON.stringify({ name, parentId: folderId }) });
                await load();
              }}
            >
              New folder
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() =>
                navigate(folderId ? `/app/import-google?folderId=${encodeURIComponent(folderId)}` : "/app/import-google")
              }
            >
              From Google Drive
            </button>
          </>
        )}
        <input className="search" placeholder="Search in MyCloud" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="name">Name</option>
          <option value="date">Modified</option>
          <option value="size">Size</option>
        </select>
        {inTrash && (
          <button
            className="btn danger"
            type="button"
            onClick={async () => {
              if (!window.confirm("Permanently delete everything in trash?")) return;
              await api("/api/files/empty-trash", { method: "POST" });
              await load();
            }}
          >
            Empty trash
          </button>
        )}
      </div>

      {selCount > 0 && (
        <div className="bulk-bar">
          <span>{selCount} selected</span>
          {inTrash ? (
            <>
              <button className="btn secondary" type="button" onClick={() => bulk("restore")}>Restore</button>
              <button className="btn danger" type="button" onClick={() => bulk("purge")}>Delete forever</button>
            </>
          ) : (
            <>
              <button className="btn secondary" type="button" onClick={() => bulk("star")}>Star</button>
              <button className="btn secondary" type="button" onClick={() => bulk("unstar")}>Unstar</button>
              <button className="btn danger" type="button" onClick={() => bulk("trash")}>Move to trash</button>
              {mode === "drive" && (
                <>
                  <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
                    <option value="">My Drive (root)</option>
                    {tree.filter((t) => !selected.folders.has(t.id)).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <button className="btn secondary" type="button" onClick={moveSelected}>Move</button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {progress > 0 && (
        <div className="progress" style={{ marginBottom: 12 }}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div
        className={`dropzone ${dropOver ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (mode === "drive") setDropOver(true); }}
        onDragLeave={() => setDropOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropOver(false);
          if (mode === "drive" && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
        }}
      >
        {sortedFolders.length === 0 && sortedFiles.length === 0 ? (
          <div className="empty">
            {mode === "drive" ? "Drop files here, or click New upload. Bytes stay on this server disk." : "Nothing here yet."}
          </div>
        ) : view === "grid" ? (
          <div className="drive-grid">
            {sortedFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={`tile ${selected.folders.has(folder.id) ? "sel" : ""}`}
                onDoubleClick={() => openFolder(folder)}
                onClick={(e) => {
                  if (e.detail === 1) {
                    const next = new Set(selected.folders);
                    if (next.has(folder.id)) next.delete(folder.id);
                    else next.add(folder.id);
                    setSelected({ ...selected, folders: next });
                  }
                }}
              >
                <div className="tile-icon folder">{folder.starred ? "★" : "DIR"}</div>
                <div className="tile-name">{folder.name}</div>
                <div className="tile-meta">{formatDate(folder.createdAt)}</div>
              </button>
            ))}
            {sortedFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                className={`tile ${selected.files.has(file.id) ? "sel" : ""}`}
                onDoubleClick={() => openPreview(file)}
                onClick={() => {
                  const next = new Set(selected.files);
                  if (next.has(file.id)) next.delete(file.id);
                  else next.add(file.id);
                  setSelected({ ...selected, files: next });
                }}
              >
                <div className={`tile-icon mime-${fileGlyph(file.mimeType).toLowerCase()}`}>
                  {file.starred ? "★ " : ""}
                  {fileGlyph(file.mimeType)}
                </div>
                <div className="tile-name">{file.displayName}</div>
                <div className="tile-meta">{formatBytes(file.sizeBytes)} · {formatDate(file.updatedAt)}</div>
              </button>
            ))}
          </div>
        ) : (
          <table className="file-table">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Modified</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedFolders.map((folder) => (
                <tr key={folder.id} className={selected.folders.has(folder.id) ? "sel" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.folders.has(folder.id)}
                      onChange={() => {
                        const next = new Set(selected.folders);
                        if (next.has(folder.id)) next.delete(folder.id);
                        else next.add(folder.id);
                        setSelected({ ...selected, folders: next });
                      }}
                    />
                  </td>
                  <td>
                    <button className="crumb" type="button" onClick={() => openFolder(folder)}>
                      {folder.starred ? "★ " : ""}{folder.name}
                    </button>
                  </td>
                  <td>Folder</td>
                  <td>—</td>
                  <td>{formatDate(folder.createdAt)}</td>
                  <td className="row-actions">
                    {!inTrash && (
                      <>
                        <button className="btn ghost" type="button" onClick={() => toggleStar("folder", folder.id, !!folder.starred)}>Star</button>
                        <button className="btn ghost" type="button" onClick={() => renameItem("folder", folder.id, folder.name)}>Rename</button>
                        <button className="btn ghost" type="button" onClick={() => openCollab(folder, "folder")}>People</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {sortedFiles.map((file) => (
                <tr key={file.id} className={selected.files.has(file.id) ? "sel" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.files.has(file.id)}
                      onChange={() => {
                        const next = new Set(selected.files);
                        if (next.has(file.id)) next.delete(file.id);
                        else next.add(file.id);
                        setSelected({ ...selected, files: next });
                      }}
                    />
                  </td>
                  <td>
                    <button className="crumb" type="button" onClick={() => openPreview(file)}>
                      {file.starred ? "★ " : ""}{file.displayName}
                    </button>
                  </td>
                  <td>{file.mimeType}</td>
                  <td>{formatBytes(file.sizeBytes)}</td>
                  <td>{formatDate(file.updatedAt)}</td>
                  <td className="row-actions">
                    {!inTrash && (
                      <>
                        <button className="btn ghost" type="button" onClick={() => saveBlob(file)}>Download</button>
                        <button className="btn ghost" type="button" onClick={() => toggleStar("file", file.id, !!file.starred)}>Star</button>
                        <button className="btn ghost" type="button" onClick={() => renameItem("file", file.id, file.displayName)}>Rename</button>
                        <button className="btn ghost" type="button" onClick={() => copyFile(file.id)}>Make a copy</button>
                        <button className="btn ghost" type="button" onClick={() => openVersions(file)}>Versions</button>
                        <button className="btn ghost" type="button" onClick={() => { setShareFor(file); setShareToken(null); }}>Link</button>
                        <button className="btn ghost" type="button" onClick={() => openCollab(file, "file")}>People</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {preview && (
        <div className="drawer">
          <div className="drawer-head">
            <strong>{preview.file.displayName}</strong>
            <button className="btn ghost" type="button" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>Close</button>
          </div>
          <p className="muted">{preview.file.mimeType} · {formatBytes(preview.file.sizeBytes)}</p>
          <div className="preview-body">
            {preview.file.mimeType.startsWith("image/") && <img src={preview.url} alt={preview.file.displayName} />}
            {preview.file.mimeType === "application/pdf" && <iframe title="pdf" src={preview.url} />}
            {preview.file.mimeType.startsWith("video/") && <video src={preview.url} controls />}
            {preview.file.mimeType.startsWith("audio/") && <audio src={preview.url} controls />}
            {preview.text != null && <pre>{preview.text.slice(0, 20000)}</pre>}
          </div>
          <div className="toolbar">
            <button className="btn" type="button" onClick={() => saveBlob(preview.file)}>Download</button>
            <button className="btn secondary" type="button" onClick={() => openVersions(preview.file)}>Versions</button>
            <button className="btn secondary" type="button" onClick={() => { setShareFor(preview.file); setShareToken(null); }}>Share link</button>
          </div>
        </div>
      )}

      {shareFor && (
        <div className="modal-backdrop" onClick={() => setShareFor(null)}>
          <form className="card modal stack" onClick={(e) => e.stopPropagation()} onSubmit={createShare}>
            <h3>Anyone-with-the-link</h3>
            <p className="muted">{shareFor.displayName}. Token is shown once. Files stay on this disk.</p>
            <label className="stack">Optional password<input name="password" type="password" minLength={4} /></label>
            <label className="stack">Expires in hours (0 = never)<input name="hours" type="number" min={0} defaultValue={24} /></label>
            <label className="stack">Max downloads (0 = unlimited)<input name="maxDownloads" type="number" min={0} defaultValue={0} /></label>
            {shareToken && (
              <p className="ok">
                Copy now:<br />
                <code>{`${window.location.origin}/share/${shareToken}`}</code>
              </p>
            )}
            <div className="toolbar">
              <button className="btn" type="submit">Create link</button>
              <button className="btn secondary" type="button" onClick={() => setShareFor(null)}>Close</button>
            </div>
          </form>
        </div>
      )}

      {versionsFor && (
        <div className="modal-backdrop" onClick={() => setVersionsFor(null)}>
          <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
            <h3>Version history</h3>
            <p className="muted">
              {versionsFor.displayName}. Replacing or restoring keeps the current bytes as a previous version (up to 20). Bytes stay on this disk.
            </p>
            <input
              ref={replaceInput}
              type="file"
              hidden
              onChange={(e) => {
                if (e.target.files) replaceCurrent(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="toolbar">
              <button className="btn" type="button" disabled={busy} onClick={() => replaceInput.current?.click()}>
                {busy ? "Uploading..." : "Upload new version"}
              </button>
              <button className="btn secondary" type="button" onClick={() => setVersionsFor(null)}>Close</button>
            </div>
            {versions.length === 0 ? (
              <p className="muted">No previous versions yet. Upload a replacement to start history.</p>
            ) : (
              <ul className="plain">
                {versions.map((v) => (
                  <li key={v.id}>
                    <strong>v{v.versionNumber}</strong> · {formatBytes(v.sizeBytes)} · {formatDate(v.createdAt)}
                    <div className="toolbar" style={{ marginTop: 6 }}>
                      <button className="btn ghost" type="button" onClick={() => previewVersion(versionsFor, v)}>Preview</button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => saveBlob({ ...versionsFor, displayName: `${versionsFor.displayName}.v${v.versionNumber}` }, `/api/files/${versionsFor.id}/versions/${v.id}/download`)}
                      >
                        Download
                      </button>
                      <button className="btn secondary" type="button" onClick={() => restoreVersion(versionsFor.id, v.id)}>Restore</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {collabFor && (
        <div className="modal-backdrop" onClick={() => setCollabFor(null)}>
          <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
            <h3>Share with people</h3>
            <p className="muted">Registered users on this server only. Viewer can download; editor can also rename.</p>
            <form className="toolbar" onSubmit={addCollab}>
              <input name="email" type="email" placeholder="user@email" required />
              <select name="permission" defaultValue="viewer">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button className="btn" type="submit">Add</button>
            </form>
            {collabs.length === 0 ? <p className="muted">No people yet.</p> : (
              <ul className="plain">
                {collabs.map((c) => (
                  <li key={c.id}>{c.display_name} ({c.email}) — {c.permission}</li>
                ))}
              </ul>
            )}
            <button className="btn secondary" type="button" onClick={() => setCollabFor(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
