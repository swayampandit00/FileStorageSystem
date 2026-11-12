import { Link } from "react-router-dom";

export function WelcomeView() {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand" style={{ marginBottom: 8 }}>
          <div className="brand-mark" />
          <div>
            <h1>MyCloud</h1>
            <p>Self-hosted Drive</p>
          </div>
        </div>
        <h2>Your files. Your disk.</h2>
        <p className="muted">
          Grid and list views, preview, trash, stars, people sharing, and public links — with every byte stored on this
          server, not a third-party object store.
        </p>
        <ul className="plain muted">
          <li>Upload, folders, move, copy, search</li>
          <li>Import selected files or folders from Google Drive</li>
          <li>Trash with restore · starred · recents</li>
          <li>Share with registered users or a secret link</li>
        </ul>
        <div className="toolbar">
          <Link to="/login" className="btn">Sign in</Link>
          <Link to="/register" className="btn secondary">Create account</Link>
        </div>
      </div>
    </div>
  );
}
