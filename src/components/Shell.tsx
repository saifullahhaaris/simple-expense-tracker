import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useSync } from "../context/SyncContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";
import { pendingCount } from "../lib/sync";
import { lastBackupAt } from "../lib/exporter";
import { formatDate } from "../lib/format";
import { toISODate } from "../lib/dates";

const NAV = [
  { to: "/dashboard", icon: "⌂", label: "Dashboard" },
  { to: "/projects", icon: "▦", label: "Projects" },
  { to: "/notes", icon: "▤", label: "Notes" },
  { to: "/charts", icon: "▥", label: "Charts" }
];

const MenuContext = createContext<{ open: () => void }>({ open: () => undefined });

export function SyncBadge() {
  const { status, label, message } = useSync();
  return (
    <span className="sync-status" data-status={status} role="status" title={message || label}>
      {label}
    </span>
  );
}

/** Same header as before (title + subtitle) with the sync badge and the new hamburger button. */
export function PageHeader({ title, subtitle, back }: { title: string; subtitle?: string; back?: { to: string; label: string } }) {
  const { open } = useContext(MenuContext);
  return (
    <header>
      <div>
        {back && <NavLink to={back.to} className="back-link">{back.label}</NavLink>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      <div className="header-actions">
        <SyncBadge />
        <button type="button" className="menu-button" aria-label="Open menu" aria-haspopup="dialog" onClick={open}>
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
}

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const sync = useSync();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [syncing, setSyncing] = useState(false);
  const backup = lastBackupAt();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("menu-open");
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("menu-open"); };
  }, [open, onClose]);

  const logout = async () => {
    let message = "Log out of MonetaTracker?";
    try {
      const count = await pendingCount();
      if (count > 0) message = `${count} change(s) are waiting to sync. They stay on this device and sync after you sign in again. Log out anyway?`;
    } catch { /* ignore */ }
    if (!confirm(message)) return;
    const { error } = await supabase.auth.signOut();
    if (error) { alert(error.message); return; }
    queryClient.clear();
    onClose();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <div className={`drawer-overlay${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`drawer${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Menu" aria-hidden={!open}>
        <div className="drawer-head">
          <div className="drawer-brand">
            <img src="/assets/moneta-icon.svg" alt="" width="34" height="34" />
            <div>
              <strong>MonetaTracker</strong>
              <span title={user?.email ?? ""}>{user?.email ?? "Signed in"}</span>
            </div>
          </div>
          <button ref={closeRef} type="button" className="drawer-close" aria-label="Close menu" onClick={onClose}>✕</button>
        </div>

        <nav className="drawer-section" aria-label="Pages">
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `drawer-link${isActive ? " active" : ""}`} onClick={onClose}>
              <span className="drawer-icon">{item.icon}</span>{item.label}
            </NavLink>
          ))}
          <NavLink to="/backup" className={({ isActive }) => `drawer-link${isActive ? " active" : ""}`} onClick={onClose}>
            <span className="drawer-icon">⇩</span>Backup &amp; export
          </NavLink>
        </nav>

        <div className="drawer-section">
          <p className="drawer-label">Appearance</p>
          <button type="button" className="drawer-link" onClick={toggle} role="switch" aria-checked={theme === "dark"}>
            <span className="drawer-icon">{theme === "dark" ? "☾" : "☀"}</span>
            {theme === "dark" ? "Dark theme" : "Light theme"}
            <span className={`switch${theme === "dark" ? " on" : ""}`} aria-hidden="true"><i /></span>
          </button>
        </div>

        <div className="drawer-section">
          <p className="drawer-label">Sync</p>
          <div className="drawer-sync">
            <span className="sync-status" data-status={sync.status} title={sync.message || sync.label}>{sync.label}</span>
            <button type="button" className="secondary" disabled={syncing || !navigator.onLine}
              onClick={async () => { setSyncing(true); try { await sync.syncNow(); } finally { setSyncing(false); } }}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
          {sync.message.startsWith("Sync failed:") && <p className="drawer-note">{sync.message}</p>}
          <p className="drawer-note">
            {backup ? `Last backup: ${formatDate(toISODate(new Date(backup)))}` : "No backup downloaded from this device yet."}
          </p>
        </div>

        <div className="drawer-footer">
          <button type="button" className="drawer-logout" onClick={logout}>Log out</button>
        </div>
      </aside>
    </>
  );
}

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {NAV.map(item => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Layout for all signed-in pages: page content + drawer + bottom navigation. */
export function Shell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <MenuContext.Provider value={{ open: () => setOpen(true) }}>
      <div className="app">{children ?? <Outlet />}</div>
      <BottomNav />
      <Drawer open={open} onClose={() => setOpen(false)} />
    </MenuContext.Provider>
  );
}
