import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import './Auth.css';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
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
      const res = await api.register({ email, password, name });
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
          <p>Enterprise-grade algorithmic trading and backtesting platform. Connect, analyze, and automate.</p>
        </div>
      </div>

      <div className="blueprint-auth-sidebar">
        <div className="blueprint-auth-card">
          <div>
            <h2>Register</h2>
            <p className="subtitle">Create a new operator account</p>
          </div>
          
          {error && <div className="error-banner">{error}</div>}
          
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="FULL_NAME"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
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
            <button type="submit">Initialize Account</button>
          </form>
          
          <p className="switch-link">
            ACCOUNT_FOUND? <Link to="/login">AUTHENTICATE</Link>
          </p>
        </div>
      </div>
      
    </div>
  );
}
