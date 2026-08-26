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
    <div className="blueprint-auth-layout">
      
      <div className="blueprint-auth-hero">
        <div className="blueprint-auth-hero-content">
          <h1>Parakh Engine</h1>
          <p>Trading Intelligence</p>
        </div>
      </div>

      <div className="blueprint-auth-sidebar">
        <div className="blueprint-auth-card">
          <div>
            <h2>Sign In</h2>
            <p className="subtitle">Access your workspace</p>
          </div>
          
          {error && <div className="error-banner">{error}</div>}
          
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="EMAIL_ADDRESS"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="PASSWORD"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">Initialize Session</button>
          </form>
          
          {ENABLE_SIGNUP && (
            <p className="switch-link">
              NO_ACCOUNT_FOUND? <Link to="/register">REGISTER_NEW_USER</Link>
            </p>
          )}
        </div>
      </div>
      
    </div>
  );
}
