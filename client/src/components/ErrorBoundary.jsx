import { Component } from 'react';

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
          <div style={s.icon}>⚠️</div>
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
  box:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, padding: 32, color: '#f0f2f7' },
  icon:  { fontSize: 40 },
  title: { fontSize: 18, fontWeight: 700 },
  msg:   { fontSize: 13, color: '#7a8499', textAlign: 'center', maxWidth: 300 },
  btn:   { marginTop: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 20px', color: '#f0f2f7', cursor: 'pointer', fontSize: 14, fontFamily: 'Heebo, sans-serif' },
};
