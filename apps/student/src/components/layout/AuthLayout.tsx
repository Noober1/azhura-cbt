import React from "react";

interface AuthLayoutProps {
  /** Content rendered inside the centered auth card (e.g. the login form). */
  children: React.ReactNode;
}

/**
 * Full-screen centered layout for unauthenticated pages, with a decorative
 * gradient/blur background and a footer note. Wraps the login form.
 */
export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-linear-to-tr from-indigo-950 via-slate-900 to-emerald-950">
      {/* Decorative Blur Background Circles */}
      <div className="absolute w-160 h-160 rounded-full bg-indigo-600/10 blur-3xl -top-40 -left-40 animate-pulse duration-10000" />
      <div className="absolute w-120 h-120 rounded-full bg-emerald-600/5 blur-3xl -bottom-20 -right-20 animate-pulse duration-7000" />

      {/* Floating Subtle Pattern Overlay */}
      <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(#fff_1px,transparent_1px)] bg-size-[24px_24px] pointer-events-none" />

      {/* Card Content container */}
      <div className="relative z-10 w-full max-w-md">
        {children}
        
        {/* Footer Note */}
        <p className="text-center text-xs text-neutral-400 mt-6 font-medium tracking-wide">
          Sistem Ujian Aman (CBT Desktop Node) &bull; Azhura Exam 2026
        </p>
      </div>
    </div>
  );
};
