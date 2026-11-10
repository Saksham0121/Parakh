import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { ENABLE_SIGNUP } from '../config';
import AuthLayout from './AuthLayout';
import { Spinner } from '../components/ui/primitives';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();

  useEffect(() => { if (isAuthenticated) navigate('/', { replace: true }); }, [isAuthenticated, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await api.login({ email, password });
      login(res.user, res.accessToken);
      navigate('/');
    } catch (err) {
      setError((err as Error).message || 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        <div><h2>Sign in</h2><p className="hint">Welcome back.</p></div>
        {error && <div className="notice notice-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy && <Spinner size={14} />} Sign in</button>
        </form>
        {ENABLE_SIGNUP && <p className="hint">New to Parakh? <Link to="/register">Create an account</Link></p>}
      </div>
    </AuthLayout>
  );
}
