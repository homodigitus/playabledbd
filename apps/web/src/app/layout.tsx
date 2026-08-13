import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { NavBar } from "@/components/nav-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumen Playables — RAG Assistant",
  description: "Internal RAG case study for Lumen Playables"
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <NavBar />
          <main className="page-container">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
