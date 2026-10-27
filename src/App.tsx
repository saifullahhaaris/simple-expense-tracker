import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Shell } from "./components/Shell";
import { Login, Signup } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";

// Heavier pages load on demand (Chart.js, Excel export).
const Charts = lazy(() => import("./pages/Charts"));
const Notes = lazy(() => import("./pages/Notes"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Backup = lazy(() => import("./pages/Backup"));

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="app"><p className="empty">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <Shell>
      <Suspense fallback={<p className="empty">Loading…</p>}>
        <AppRoutes />
      </Suspense>
    </Shell>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/charts" element={<Charts />} />
      <Route path="/notes" element={<Notes />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/projects/:id" element={<ProjectDetail />} />
      <Route path="/backup" element={<Backup />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      {/* Old bookmarks / installed-app shortcuts from the HTML version */}
      <Route path="/index.html" element={<Navigate to="/login" replace />} />
      <Route path="/signup.html" element={<Navigate to="/signup" replace />} />
      <Route path="/dashboard.html" element={<Navigate to="/dashboard" replace />} />
      <Route path="/charts.html" element={<Navigate to="/charts" replace />} />
      <Route path="/notes.html" element={<Navigate to="/notes" replace />} />
      <Route path="/projects.html" element={<Navigate to="/projects" replace />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/*" element={<RequireAuth />} />
    </Routes>
  );
}
