import { Component } from 'react';
import { IconAlertCircle } from '../icons.jsx';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={s.box}>
          <IconAlertCircle size={40} style={{ color: 'var(--destructive)' }} />
          <div style={s.title}>משהו השתבש</div>
          <div style={s.msg}>{this.state.error.message}</div>
          <button style={s.btn} onClick={() => this.setState({ error: null })}>נסה שוב</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const s = {
  box:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, padding: 32, background: 'var(--background)' },
  title: { fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700, color: 'var(--foreground)' },
  msg:   { fontSize: 13, color: 'var(--muted-foreground)', textAlign: 'center', maxWidth: 300 },
  btn:   { marginTop: 8, background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 22px', color: 'var(--foreground)', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-body)' },
};
