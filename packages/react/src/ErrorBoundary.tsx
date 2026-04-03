import { Button } from '#components/ui/button';
import { Component, type ReactNode } from 'react';

type Props = {
  fallback?: (error: string, reset: () => void) => ReactNode;
  children: ReactNode;
};

type State = { error: string | null };

const defaultFallback = (error: string, reset: () => void) => (
  <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-[11px]">
    <div className="text-destructive font-mono break-all">{error}</div>
    <Button
      variant="link"
      size="sm"
      className="mt-1 h-auto p-0 text-[10px] text-muted-foreground hover:text-foreground underline"
      onClick={reset}
    >
      Retry
    </Button>
  </div>
);

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (this.props.fallback ?? defaultFallback)(this.state.error, this.reset);
    }
    return this.props.children;
  }
}
