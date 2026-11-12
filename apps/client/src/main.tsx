import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { GuestOnly, RequireAdmin, RequireAuth } from "./components/Guards";
import { Layout } from "./components/Layout";
import "./styles/app.css";
import { AdminAuditView } from "./views/admin/AdminAuditView";
import { AdminOverviewView } from "./views/admin/AdminOverviewView";
import { AdminUsersView } from "./views/admin/AdminUsersView";
import { AccountView } from "./views/user/AccountView";
import { DashboardView } from "./views/user/DashboardView";
import { FilesView } from "./views/user/FilesView";
import { ImportGoogleView } from "./views/user/ImportGoogleView";
import { LoginView } from "./views/user/LoginView";
import { RecentView } from "./views/user/RecentView";
import { RegisterView } from "./views/user/RegisterView";
import { SharedView } from "./views/user/SharedView";
import { SharedWithMeView } from "./views/user/SharedWithMeView";
import { SharePublicView } from "./views/user/SharePublicView";
import { StarredView } from "./views/user/StarredView";
import { TrashView } from "./views/user/TrashView";
import { WelcomeView } from "./views/user/WelcomeView";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/" element={<WelcomeView />} />
            <Route path="/login" element={<LoginView />} />
            <Route path="/register" element={<RegisterView />} />
          </Route>
          <Route path="/share/:token" element={<SharePublicView />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/app" element={<DashboardView />} />
              <Route path="/app/files" element={<FilesView />} />
              <Route path="/app/import-google" element={<ImportGoogleView />} />
              <Route path="/app/shared-with-me" element={<SharedWithMeView />} />
              <Route path="/app/shared" element={<SharedView />} />
              <Route path="/app/starred" element={<StarredView />} />
              <Route path="/app/recent" element={<RecentView />} />
              <Route path="/app/trash" element={<TrashView />} />
              <Route path="/app/account" element={<AccountView />} />
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<AdminOverviewView />} />
                <Route path="/admin/users" element={<AdminUsersView />} />
                <Route path="/admin/audit" element={<AdminAuditView />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);
