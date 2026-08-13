"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") return null;

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <header className="nav-bar">
      <div className="nav-brand">Lumen Playables RAG</div>
      <nav className="nav-links">
        {user && (
          <>
            <Link href="/">Chat</Link>
            {user.role === "ADMIN" && <Link href="/admin">Admin</Link>}
          </>
        )}
      </nav>
      <div className="nav-user">
        {user ? (
          <>
            <span>
              {user.name} ({user.role})
            </span>
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <Link href="/login">Log in</Link>
        )}
      </div>
    </header>
  );
}
