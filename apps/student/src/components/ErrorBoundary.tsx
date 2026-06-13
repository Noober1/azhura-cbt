import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { reportError } from "../lib/error-reporter";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * App-wide React error boundary (#171). A render-time crash anywhere in the
 * wrapped subtree is caught here, auto-reported to the backend via
 * {@link reportError}, and replaced with a friendly in-page fallback (no new
 * window/tab — that would break anti-cheat kiosk/keyboard lockdown). The only
 * recovery action is an in-place reload, which keeps the locked-down window
 * intact while clearing the broken React tree.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Fire-and-forget: reportError debounces + swallows transport failures, so
    // a crash loop can never flood the endpoint or re-throw out of here.
    reportError({
      error,
      component: "ErrorBoundary",
      stack: info.componentStack ?? error.stack,
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border-[2.5px] border-[var(--nb-ink)] bg-card p-8 text-center shadow-[6px_6px_0_var(--nb-ink)]">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border-[2.5px] border-[var(--nb-ink)] bg-destructive text-white">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="mb-2 text-xl font-extrabold tracking-tight text-foreground">
            Terjadi Kesalahan
          </h1>
          <p className="mb-6 text-sm font-medium text-muted-foreground">
            Aplikasi mengalami gangguan tak terduga. Laporan otomatis sudah
            dikirim. Silakan muat ulang halaman untuk melanjutkan.
          </p>
          <Button
            variant="default"
            onClick={this.handleReload}
            className="w-full font-bold"
          >
            <RotateCcw className="h-4 w-4" />
            Muat Ulang
          </Button>
        </div>
      </div>
    );
  }
}
