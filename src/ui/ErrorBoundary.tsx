import { Component, type ReactNode } from "react";

/**
 * Keeps a UI bug contained to its panel: without it React unmounts the whole
 * app, which would also dispose the GPU renderer.
 */
export class ErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.name}]`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel-error">
        <b>{this.props.name} hit an error</b>
        <code>{this.state.error.message}</code>
        <button className="btn small" onClick={() => this.setState({ error: null })}>
          Retry
        </button>
      </div>
    );
  }
}
