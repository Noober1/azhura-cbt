import { GraduationCap, LogOut, HelpCircle } from "lucide-react";
import { useAuthStore } from "../../stores/auth";
import { useConfigStore } from "../../stores/config";
import { Button } from "../ui/button";
import { replayDashboardTour } from "../../lib/tour";

/**
 * Main dashboard navigation bar. Shows the app brand on the left and the
 * signed-in student's full name plus help + logout actions on the right.
 */
export const DashboardNavbar = () => {
  const { user, logout, isLoading } = useAuthStore();
  // Prefer the configured school name at the branding slot when available (#148).
  const schoolName = useConfigStore((s) => s.schoolInfo?.schoolName);

  return (
    // Solid near-black band + thick ink bottom border — no blur (neobrutalist).
    <header className="sticky top-0 z-40 w-full border-b-[3px] border-[var(--nb-ink)] bg-primary text-primary-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo text-white p-2 rounded-xl border-2 border-white/25">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-extrabold tracking-tight text-sm text-primary-foreground">
              {schoolName ?? "Azhura CBT"}
            </span>
            <span className="text-[0.7rem] font-medium text-primary-foreground/60">
              Computer-Based Test
            </span>
          </div>
        </div>

        {/* User + actions */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="font-bold text-sm text-primary-foreground truncate max-w-48">
              {user?.name ?? "Peserta"}
            </span>
            <span className="tabular text-[0.7rem] font-medium text-primary-foreground/60">
              NIS: {user?.nis ?? "-"}
            </span>
          </div>
          {/* Replays the dashboard product tour on demand (#145). */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => replayDashboardTour()}
            aria-label="Buka panduan penggunaan"
            className="font-semibold rounded-lg"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Panduan</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => logout()}
            disabled={isLoading}
            className="font-semibold rounded-lg"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
