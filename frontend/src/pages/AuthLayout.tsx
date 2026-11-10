import type { ReactNode } from 'react';
import { BellRing, FlaskConical, PenTool, Radar } from 'lucide-react';

const POINTS = [
  { icon: Radar, text: 'Define your setup once — a breakout, a crossover, an RSI level — and add fundamental filters like P/E, ROE and debt.' },
  { icon: BellRing, text: 'Parakh scans your symbols every minute and alerts you the moment one has your setup, with the reasons why.' },
  { icon: FlaskConical, text: 'Backtest any setup on years of history before you trust it, with stops, targets and costs.' },
  { icon: PenTool, text: 'Chart with trend lines, channels, Fibonacci, long/short position tools and saved drawings.' },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="nav-logo" style={{ margin: 0 }}>P</div>
          <span style={{ fontWeight: 600, fontSize: 16 }}>Parakh</span>
        </div>
        <div>
          <h1>Find the trades that fit your rules.</h1>
          <p>Trade analysis for people who know what they’re looking for. Not a broker — Parakh never places orders.</p>
          <div className="auth-points">
            {POINTS.map(({ icon: Icon, text }) => <div key={text}><Icon size={18} /><span>{text}</span></div>)}
          </div>
        </div>
        <p className="hint">Market data from Yahoo Finance. Prices may be delayed.</p>
      </section>
      <section className="auth-form">{children}</section>
    </div>
  );
}
