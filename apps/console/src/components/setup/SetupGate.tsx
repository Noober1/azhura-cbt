/**
 * Azhura CBT Console — First-run Setup Gate.
 *
 * Wraps the app router. On boot it asks the backend whether first-run setup is
 * needed (no admin exists). While checking it shows a splash; if setup is needed
 * it renders the <SetupWizard> instead of the normal routes; otherwise it hands
 * off to the children (the router).
 *
 * The check runs once on mount and is intentionally NOT skipped for an existing
 * local session: a JWT stays cryptographically valid even after its user row is
 * gone (e.g. a wiped database), so trusting a stale token here would hide the
 * wizard and drop the operator into an empty console. The wizard reports back via
 * `onComplete` to leave the gate deterministically once setup succeeds.
 */

import { useEffect, useState, type ReactNode } from "react";
import { setupApi } from "../../lib/setup-api";
import { getErrorMessage } from "../../lib/errors";
import { SetupWizard } from "./SetupWizard";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

type GateState = "loading" | "needed" | "ready" | "error";

export function SetupGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setupApi
      .getStatus()
      .then((status) => {
        if (cancelled) return;
        setState(status.needsSetup ? "needed" : "ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, "Tidak dapat menghubungi server."));
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center text-faint">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="w-full max-w-sm text-center">
          <h2 className="text-lg font-semibold text-ink">Gagal terhubung</h2>
          <p className="mt-2 text-sm text-faint">{error}</p>
          <p className="mt-1 text-sm text-faint">
            Pastikan server backend berjalan, lalu coba lagi.
          </p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  if (state === "needed") {
    return <SetupWizard onComplete={() => setState("ready")} />;
  }

  return <>{children}</>;
}
