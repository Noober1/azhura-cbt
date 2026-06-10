/**
 * Azhura CBT App - Minimum Resolution Guard (#48)
 *
 * Blocking, full-screen warning shown at startup when the monitor is below the
 * exam UI's minimum resolution (1280×720). There is deliberately NO bypass: a
 * cramped layout can clip questions or controls mid-exam, so the student must
 * fix their display before the app is usable.
 *
 * The resolution is read once at mount (see `App.tsx`) — per #48 we do not
 * re-check on resize.
 */

import { MonitorX } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { MIN_SCREEN_WIDTH, MIN_SCREEN_HEIGHT } from "../../lib/screen";

interface ResolutionGuardProps {
  /** The detected screen width in CSS pixels. */
  width: number;
  /** The detected screen height in CSS pixels. */
  height: number;
}

export function ResolutionGuard({ width, height }: ResolutionGuardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg border-destructive/30">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <MonitorX className="size-7 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Resolusi Layar Tidak Cukup</CardTitle>
          <CardDescription>
            Aplikasi ujian membutuhkan resolusi layar minimal agar seluruh soal
            dan tombol tampil dengan benar.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted p-3 text-center">
              <p className="text-xs font-semibold text-muted-foreground">
                Resolusi Saat Ini
              </p>
              <p className="mt-1 text-lg font-bold text-destructive">
                {width} × {height}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-3 text-center">
              <p className="text-xs font-semibold text-muted-foreground">
                Minimum Dibutuhkan
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {MIN_SCREEN_WIDTH} × {MIN_SCREEN_HEIGHT}
              </p>
            </div>
          </div>

          <div className="rounded-lg border-2 border-[var(--nb-ink)] bg-amber px-4 py-3 text-foreground">
            <p className="text-sm font-semibold">Cara memperbaiki:</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
              <li>
                Buka <strong>Pengaturan Sistem</strong> &rarr;{" "}
                <strong>Tampilan / Display</strong>.
              </li>
              <li>
                Naikkan resolusi layar minimal ke{" "}
                <strong>
                  {MIN_SCREEN_WIDTH} × {MIN_SCREEN_HEIGHT}
                </strong>{" "}
                atau lebih tinggi.
              </li>
              <li>Tutup dan buka kembali aplikasi ini.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
