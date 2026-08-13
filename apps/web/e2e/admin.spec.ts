import { expect, test } from "@playwright/test";
import { apiUrl, jsonRoute, adminUser, plainUser } from "./fixtures.js";

test.describe("admin dashboard", () => {
  test("a non-admin user visiting /admin is redirected to the chat page", async ({ page }) => {
    await page.route(apiUrl("/api/auth/me"), async (route) => {
      await jsonRoute(route, 200, { user: plainUser });
    });

    await page.goto("/admin");

    await expect(page).toHaveURL("/");
  });

  test("overview page renders seeded stats and recent searches", async ({ page }) => {
    await page.route(apiUrl("/api/auth/me"), async (route) => {
      await jsonRoute(route, 200, { user: adminUser });
    });
    await page.route(apiUrl("/api/admin/stats/overview"), async (route) => {
      await jsonRoute(route, 200, {
        documents: { total: 5, indexed: 3, failed: 1, pending: 1, removed: 0 },
        chunks: { total: 42 },
        lastIngestion: { id: "33333333-3333-3333-3333-333333333333", status: "SUCCEEDED", finishedAt: null },
        search: {
          last24h: 2,
          last7d: 5,
          avgLatencyMs: 33,
          p95LatencyMs: 90,
          avgResultCount: 2.5,
          insufficientContextRate: 0.2
        },
        readiness: { databaseOk: true, pgvectorOk: true }
      });
    });
    await page.route(apiUrl("/api/admin/stats/recent-searches"), async (route) => {
      await jsonRoute(route, 200, {
        searches: [
          {
            id: "44444444-4444-4444-4444-444444444444",
            query: "what is the refund policy",
            retrievalMode: "hybrid",
            resultCount: 2,
            latencyMs: 30,
            answerStatus: "ANSWERED",
            createdAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      });
    });

    await page.goto("/admin");

    await expect(page.locator(".stats-grid")).toContainText("3");
    await expect(page.locator(".stats-grid")).toContainText("42");
    await expect(page.locator(".badge-success", { hasText: "OK" }).first()).toBeVisible();
    await expect(page.locator("table")).toContainText("what is the refund policy");
  });

  test("documents page lists a seeded document", async ({ page }) => {
    await page.route(apiUrl("/api/auth/me"), async (route) => {
      await jsonRoute(route, 200, { user: adminUser });
    });
    await page.route(`${apiUrl("/api/admin/documents")}**`, async (route) => {
      await jsonRoute(route, 200, {
        documents: [
          {
            id: "55555555-5555-5555-5555-555555555555",
            sourceKey: "docs/sdk.md",
            title: "SDK Overview",
            fileName: "sdk.md",
            mimeType: "text/markdown",
            sizeBytes: 2048,
            status: "INDEXED",
            chunkCount: 4,
            lastIndexedAt: "2026-01-01T00:00:00.000Z",
            errorMessage: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        total: 1,
        page: 1,
        pageSize: 50
      });
    });

    await page.goto("/admin/documents");

    await expect(page.locator("table")).toContainText("SDK Overview");
    await expect(page.locator("table")).toContainText("INDEXED");
    await expect(page.getByText("1 total document(s)")).toBeVisible();
  });

  test("triggering ingestion adds a new run to the list", async ({ page }) => {
    await page.route(apiUrl("/api/auth/me"), async (route) => {
      await jsonRoute(route, 200, { user: adminUser });
    });

    let triggered = false;
    const runningRun = {
      id: "66666666-6666-6666-6666-666666666666",
      status: "RUNNING",
      triggeredByUserId: adminUser.id,
      sourcePath: "/corpus",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: null,
      documentsSeen: 0,
      documentsIndexed: 0,
      documentsSkipped: 0,
      documentsFailed: 0,
      chunksCreated: 0,
      errorSummary: null
    };

    await page.route(apiUrl("/api/admin/ingestion"), async (route) => {
      if (route.request().method() === "POST") {
        triggered = true;
        await jsonRoute(route, 200, { run: runningRun });
        return;
      }
      await jsonRoute(route, 200, { runs: triggered ? [runningRun] : [] });
    });

    await page.goto("/admin/ingestion");
    await expect(page.getByText("No ingestion runs yet.")).toBeVisible();

    await page.getByRole("button", { name: "Trigger ingestion" }).click();

    await expect(page.locator("table")).toContainText("RUNNING");
  });
});
