import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { ENABLE_SIGNUP } from '../config';
import './Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useAuthStore((state) => state.login);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigate = useNavigate();

  // Auto-redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.login({ email, password });
      login(res.user, res.accessToken);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-container flex items-center justify-center w-full h-full">
      <div className="auth-card flex flex-col gap-4 p-4">
        <h2>Welcome Back</h2>
        <p className="subtitle">Sign in to your Parakh account</p>
        
        {error && <div className="error-banner">{error}</div>}
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Sign In</button>
        </form>
        
        {ENABLE_SIGNUP && (
          <p className="switch-link">
            Don't have an account? <Link to="/register">Create one</Link>
          </p>
        )}
      </div>
    </div>
  );
}
