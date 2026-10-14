import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Shown in the header so users know which area failed */
  label?: string;
}

interface State {
  error: Error | null;
}

/** Keeps a render crash in one area from blanking the whole console. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-6 p-5 rounded-xl border border-rose-500/30 bg-rose-500/5 text-sm">
        <div className="flex items-center gap-2 text-rose-400 font-semibold">
          <AlertTriangle className="w-4 h-4" />
          Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}
        </div>
        <pre className="mt-3 p-3 rounded bg-black/30 text-xs text-content-muted whitespace-pre-wrap break-words">
          {this.state.error.message}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-panel-alt border border-border text-xs text-content-primary hover:bg-border transition"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      </div>
    );
  }
}
