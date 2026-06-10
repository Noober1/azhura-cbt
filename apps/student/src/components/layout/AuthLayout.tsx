import React from "react";

interface AuthLayoutProps {
  /** Content rendered inside the centered auth card (e.g. the login form). */
  children: React.ReactNode;
}

/**
 * Full-screen centered layout for unauthenticated pages on the flat cream
 * shell (ink dot-grid, no gradient/blur), with a footer note. Wraps the
 * login form.
 */
export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="shell min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Card Content container */}
      <div className="relative z-10 w-full max-w-md">
        {children}

        {/* Footer Note */}
        <p className="text-center text-xs text-muted-foreground mt-6 font-bold tracking-wide">
          Sistem Ujian Aman (CBT Desktop Node) &bull; Azhura Exam 2026
        </p>
      </div>
    </div>
  );
};
