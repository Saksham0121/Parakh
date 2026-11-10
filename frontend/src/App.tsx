import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import Register from './pages/Register';
import { ENABLE_SIGNUP } from './config';

const Workspace = lazy(() => import('./pages/Workspace'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {ENABLE_SIGNUP && <Route path="/register" element={<Register />} />}
      <Route path="/" element={<ProtectedRoute><Suspense fallback={null}><Workspace /></Suspense></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
