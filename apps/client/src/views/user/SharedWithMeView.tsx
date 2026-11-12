import { useEffect, useState } from "react";
import { api, fileGlyph, formatBytes, formatDate, saveBlob, type CloudFile, type Folder } from "../../api/client";

export function SharedWithMeView() {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ files: CloudFile[]; folders: Folder[] }>("/api/storage/shared-with-me")
      .then((d) => {
        setFiles(d.files);
        setFolders(d.folders);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Shared with me</h2>
          <p className="muted">Files other accounts on this server granted you. Still stored on local disk.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {folders.length === 0 && files.length === 0 ? (
          <div className="empty">Nobody has shared an item with you yet.</div>
        ) : (
          <table className="file-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Owner</th>
                <th>Access</th>
                <th>Size</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {folders.map((f) => (
                <tr key={f.id}>
                  <td>DIR {f.name}</td>
                  <td>{f.ownerName} ({f.ownerEmail})</td>
                  <td><span className="badge">{f.permission}</span></td>
                  <td>—</td>
                  <td className="muted">{formatDate(f.createdAt)}</td>
                </tr>
              ))}
              {files.map((f) => (
                <tr key={f.id}>
                  <td>{fileGlyph(f.mimeType)} {f.displayName}</td>
                  <td>{f.ownerName} ({f.ownerEmail})</td>
                  <td><span className="badge">{f.permission}</span></td>
                  <td>{formatBytes(f.sizeBytes)}</td>
                  <td>
                    <button className="btn secondary" type="button" onClick={() => saveBlob(f)}>
                      Download
                    </button>
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
