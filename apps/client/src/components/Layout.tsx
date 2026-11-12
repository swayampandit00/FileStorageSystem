import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const userNav = [
  { to: "/app", label: "Home", end: true },
  { to: "/app/files", label: "My Drive", end: false },
  { to: "/app/import-google", label: "From Google Drive", end: false },
  { to: "/app/shared-with-me", label: "Shared with me", end: false },
  { to: "/app/shared", label: "Link shares", end: false },
  { to: "/app/starred", label: "Starred", end: false },
  { to: "/app/recent", label: "Recent", end: false },
  { to: "/app/trash", label: "Trash", end: false },
  { to: "/app/account", label: "Settings", end: false },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <h1>MyCloud</h1>
            <p>Self-hosted Drive</p>
          </div>
        </div>
        {userNav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            {n.label}
          </NavLink>
        ))}
        {user?.role === "admin" && (
          <>
            <div className="nav-label">Admin</div>
            <NavLink to="/admin" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Overview
            </NavLink>
            <NavLink to="/admin/users" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Users
            </NavLink>
            <NavLink to="/admin/audit" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Audit log
            </NavLink>
          </>
        )}
        <div className="nav-spacer" />
        <div className="muted" style={{ fontSize: 13, padding: "8px 12px" }}>
          {user?.displayName}
          <br />
          <span className={`badge ${user?.role === "admin" ? "admin" : ""}`}>{user?.role}</span>
        </div>
        <button className="btn secondary" onClick={onLogout}>
          Sign out
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
