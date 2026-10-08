import Link from "next/link";
import { Suspense } from "react";
import { ThemeControl } from "@/components/theme-control";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link href="/" className="brand">Cartograph</Link>
        <ThemeControl />
      </header>
      <main className="auth-content">
        <Suspense fallback={<p role="status">Loading sign in…</p>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
