import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

const CAMPAIGN_KEY = "champ-manager:campaign-v1";

export class BootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Capture the Canon failed to draw", error, info.componentStack);
  }

  private reloadFresh = () => {
    try {
      localStorage.removeItem(CAMPAIGN_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="device">
        <div className="status-bar">
          <span>Capture the Canon</span>
        </div>
        <section className="card" style={{ margin: 16 }}>
          <p className="kicker">Something went wrong</p>
          <h2>The screen went dark</h2>
          <p className="hint">
            The last championship could not be drawn. Leave it to get back to club select. Your invite code still works
            if the host is in the live room.
          </p>
          <div className="row-actions">
            <button type="button" className="btn" onClick={this.reloadFresh}>
              Leave and reload
            </button>
          </div>
        </section>
      </div>
    );
  }
}
