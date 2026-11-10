import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import AuthLayout from './AuthLayout';
import { Spinner } from '../components/ui/primitives';

export default function Register() {
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
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.register({ email, password });
      login(res.user, res.accessToken);
      navigate('/');
    } catch (err) {
      setError((err as Error).message || 'Could not create the account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        <div><h2>Create your account</h2><p className="hint">Free. No broker account needed.</p></div>
        {error && <div className="notice notice-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <span className="hint">At least 8 characters.</span></div>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy && <Spinner size={14} />} Create account</button>
        </form>
        <p className="hint">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </AuthLayout>
  );
}
