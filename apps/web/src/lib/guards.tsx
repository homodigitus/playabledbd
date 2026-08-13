"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";

export function RequireAuth({ children }: { children: ReactNode }): ReactNode {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <p className="status-message">Loading...</p>;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }): ReactNode {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== "ADMIN") return <p className="status-message">Loading...</p>;
  return <>{children}</>;
}
