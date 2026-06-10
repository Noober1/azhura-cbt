/**
 * Azhura CBT Console — App shell (sidebar rail + top bar + outlet).
 *
 * Wraps the authenticated area: a slim dark navigation rail, a header carrying
 * the current section and the signed-in admin, and the routed content. Only the
 * Exams section is live today; future sections (siswa/group #15, proktor) are
 * shown as disabled placeholders to set expectations.
 */

import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuthStore } from "../../stores/auth";
import { Button } from "../ui/Button";
import { FileTextIcon, PenLineIcon, ShieldIcon, LogOutIcon, UsersIcon, LayersIcon, ActivityIcon, SettingsIcon, ScrollTextIcon, BarChartIcon, LayoutDashboardIcon, ImageIcon } from "../ui/icons";
import { ChatLauncher } from "../chat/ChatLauncher";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  hint?: string;
  adminOnly?: boolean;
  supervisorOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboardIcon className="size-[18px]" />, adminOnly: true },
  { to: "/groups", label: "Grup", icon: <LayersIcon className="size-[18px]" />, adminOnly: true },
  { to: "/students", label: "Peserta", icon: <UsersIcon className="size-[18px]" />, adminOnly: true },
  { to: "/exams", label: "Ujian & Soal", icon: <FileTextIcon className="size-[18px]" />, adminOnly: true },
  { to: "/media", label: "Media", icon: <ImageIcon className="size-[18px]" /> },
  { to: "/supervisor/exams", label: "Soal Ujian", icon: <PenLineIcon className="size-[18px]" />, supervisorOnly: true },
  { to: "/monitoring", label: "Monitoring", icon: <ActivityIcon className="size-[18px]" /> },
  { to: "/recap", label: "Rekap Nilai", icon: <BarChartIcon className="size-[18px]" />, adminOnly: true },
  { to: "/logs", label: "Log", icon: <ScrollTextIcon className="size-[18px]" />, adminOnly: true },
  { to: "/settings", label: "Pengaturan", icon: <SettingsIcon className="size-[18px]" />, adminOnly: true },
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, logout } = useAuthStore();

  const currentNavLabel =
    NAV.find((item) => location.pathname.startsWith(item.to))?.label ?? "Konsol";
  const roleLabel = role === "supervisor" ? "Pengawas" : "Administrator";

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const initials = (user?.name ?? "A")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="grid min-h-dvh grid-cols-[68px_1fr] lg:grid-cols-[232px_1fr]">
      {/* Rail */}
      <aside className="sticky top-0 flex h-dvh flex-col bg-rail text-white">
        <div className="flex h-16 items-center gap-2.5 border-b-2 border-rail-line px-4 lg:px-5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-white/25 bg-accent">
            <ShieldIcon className="size-[18px]" />
          </span>
          <span className="hidden text-sm font-extrabold tracking-tight lg:block">
            Azhura CBT
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2.5 py-3 lg:px-3">
          {NAV.filter((item) =>
            (!item.adminOnly || role === "admin") &&
            (!item.supervisorOnly || role === "supervisor")
          ).map((item) =>
            item.disabled ? (
              <span
                key={item.to}
                title={item.hint}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-rail-soft/60 lg:px-3"
              >
                {item.icon}
                <span className="hidden flex-1 lg:block">{item.label}</span>
                {item.hint && (
                  <span className="hidden rounded bg-white/5 px-1.5 py-0.5 text-[0.625rem] font-medium text-rail-soft lg:block">
                    {item.hint}
                  </span>
                )}
              </span>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `focus-ring flex items-center gap-3 rounded-[var(--radius-field)] px-2.5 py-2 text-sm font-bold transition-colors lg:px-3 ${
                    isActive
                      ? // Yellow block — the neobrutalist active-nav signature.
                        "border-2 border-[var(--nb-ink)] bg-highlight text-ink shadow-[2px_2px_0_rgba(255,255,255,0.35)]"
                      : "text-rail-soft hover:bg-white/6 hover:text-white"
                  }`
                }
              >
                {item.icon}
                <span className="hidden lg:block">{item.label}</span>
              </NavLink>
            )
          )}
        </nav>

        <div className="border-t border-rail-line p-2.5 lg:p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-white/30 bg-accent text-xs font-bold text-white">
              {initials}
            </span>
            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="truncate text-sm font-medium leading-tight">
                {user?.name ?? "Admin"}
              </p>
              <p className="truncate text-xs text-rail-soft">{roleLabel}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-col">
        {/* Solid canvas + thick ink bottom border — no blur (neobrutalist). */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b-[3px] border-[var(--nb-ink)] bg-canvas px-5 lg:px-8">
          <div className="flex items-center gap-2 text-sm text-faint">
            <span className="text-base font-extrabold tracking-tight text-ink">{currentNavLabel}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            leadingIcon={<LogOutIcon className="size-4" />}
          >
            Keluar
          </Button>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      {/* Public chat (#17) — floating button + bottom drawer, available console-wide. */}
      <ChatLauncher />
    </div>
  );
}
