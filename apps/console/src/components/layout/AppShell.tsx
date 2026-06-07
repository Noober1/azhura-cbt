/**
 * Azhura CBT Console — App shell (sidebar rail + top bar + outlet).
 *
 * Wraps the authenticated area: a slim dark navigation rail, a header carrying
 * the current section and the signed-in admin, and the routed content. Only the
 * Exams section is live today; future sections (siswa/group #15, proktor) are
 * shown as disabled placeholders to set expectations.
 */

import { NavLink, Outlet, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuthStore } from "../../stores/auth";
import { Button } from "../ui/Button";
import { FileTextIcon, ShieldIcon, LogOutIcon, UsersIcon, LayersIcon, ActivityIcon } from "../ui/icons";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  hint?: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/exams", label: "Ujian & Soal", icon: <FileTextIcon className="size-[18px]" /> },
  { to: "/students", label: "Siswa", icon: <UsersIcon className="size-[18px]" />, adminOnly: true },
  { to: "/groups", label: "Group", icon: <LayersIcon className="size-[18px]" />, adminOnly: true },
  { to: "/monitoring", label: "Monitoring", icon: <ActivityIcon className="size-[18px]" /> },
];

export function AppShell() {
  const navigate = useNavigate();
  const { user, role, logout } = useAuthStore();
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
        <div className="flex h-16 items-center gap-2.5 px-4 lg:px-5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <ShieldIcon className="size-[18px]" />
          </span>
          <span className="hidden text-sm font-semibold tracking-wide lg:block">
            Azhura CBT
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2.5 py-3 lg:px-3">
          {NAV.filter((item) => !item.adminOnly || role === "admin").map((item) =>
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
                  `focus-ring flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:px-3 ${
                    isActive
                      ? "bg-white/12 text-white"
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
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-white">
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
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-canvas/80 px-5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2 text-sm text-faint">
            <span className="font-medium text-ink">Manajemen Ujian</span>
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
    </div>
  );
}
