import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, formatBytes, publicDownloadUrl, type CloudFile } from "../../api/client";

export function SharePublicView() {
  const { token } = useParams();
  const [file, setFile] = useState<CloudFile | null>(null);
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(pw?: string) {
    if (!token) return;
    setError(null);
    const qs = pw ? `?password=${encodeURIComponent(pw)}` : "";
    try {
      const data = await api<{ file: CloudFile; share: { hasPassword: boolean } }>(`/api/public/shares/${token}${qs}`);
      setFile(data.file);
      setNeedPassword(false);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "SHARE_PASSWORD") setNeedPassword(true);
      else setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    load(password);
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <h2>Shared file</h2>
        {error && <p className="error">{error}</p>}
        {needPassword && !file && (
          <form className="stack" onSubmit={onSubmit}>
            <p className="muted">This link is password protected.</p>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button className="btn">Unlock</button>
          </form>
        )}
        {file && (
          <>
            <p>
              <strong>{file.displayName}</strong>
              <br />
              <span className="muted">
                {file.mimeType} · {formatBytes(file.sizeBytes)}
              </span>
            </p>
            <a className="btn" href={publicDownloadUrl(token ?? "", password || undefined)}>
              Download
            </a>
          </>
        )}
      </div>
    </div>
  );
}
