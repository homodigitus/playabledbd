import type { Route } from "@playwright/test";

export const API_ORIGIN = "http://localhost:4000";

export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`;
}

export async function jsonRoute(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const NOW_ISO = "2026-01-01T00:00:00.000Z";

export const adminUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "admin@lumen.test",
  name: "Ada Admin",
  role: "ADMIN" as const,
  createdAt: NOW_ISO
};

export const plainUser = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@lumen.test",
  name: "Uma User",
  role: "USER" as const,
  createdAt: NOW_ISO
};
