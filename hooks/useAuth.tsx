'use client';
// hooks/useAuth.tsx — thin wrapper kept for any legacy imports
// Auth is now handled by Clerk. This file is a no-op shim.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  return {};
}
