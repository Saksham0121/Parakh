import { Component, type ReactNode } from 'react';

/** Keeps one broken view from blanking the whole workspace. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty" style={{ height: '100%' }}>
        <h3>Something went wrong in this view</h3>
        <p className="mono" style={{ fontSize: 12 }}>{this.state.error.message}</p>
        <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
