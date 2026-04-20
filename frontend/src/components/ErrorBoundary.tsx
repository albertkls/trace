import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-4 p-12 text-center">
          <div className="chip chip-stop">渲染错误</div>
          <p className="max-w-xl text-sm text-ink-soft">{error.message}</p>
          <pre className="max-h-40 max-w-2xl overflow-auto rounded-xl border border-line bg-canvas-sunken p-4 text-left text-xs text-ink-mute">
            {error.stack}
          </pre>
          <button
            className="btn btn-accent"
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
