import { GraduationCap, LogOut } from "lucide-react";
import { useAuthStore } from "../../stores/auth";
import { Button } from "../ui/button";

/**
 * Main dashboard navigation bar. Shows the app brand on the left and the
 * signed-in student's full name plus a logout action on the right.
 */
export const DashboardNavbar = () => {
  const { user, logout, isLoading } = useAuthStore();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-200/60 bg-white/80 backdrop-blur-md dark:border-neutral-800/60 dark:bg-neutral-900/80 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 text-primary p-2 rounded-xl">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-sm text-neutral-950 dark:text-neutral-50">
              Azhura CBT
            </span>
            <span className="text-[0.7rem] font-medium text-neutral-500">
              Computer-Based Test
            </span>
          </div>
        </div>

        {/* User + Logout */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate max-w-48">
              {user?.name ?? "Peserta"}
            </span>
            <span className="text-[0.7rem] font-medium text-neutral-500">
              NIS: {user?.nis ?? "-"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => logout()}
            disabled={isLoading}
            className="font-semibold rounded-lg"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Keluar Sesi</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
