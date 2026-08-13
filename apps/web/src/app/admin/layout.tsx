"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RequireAdmin } from "@/lib/guards";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/ingestion", label: "Ingestion" }
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAdmin>
      <nav className="admin-tabs">
        {TABS.map((tab) => {
          const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href} className={active ? "active" : ""}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </RequireAdmin>
  );
}
