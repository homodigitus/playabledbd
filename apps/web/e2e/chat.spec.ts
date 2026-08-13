import { expect, test } from "@playwright/test";
import { apiUrl, jsonRoute, plainUser } from "./fixtures.js";

test.describe("chat page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(apiUrl("/api/auth/me"), async (route) => {
      await jsonRoute(route, 200, { user: plainUser });
    });
  });

  test("asking a question renders the answer and its citation", async ({ page }) => {
    await page.route(apiUrl("/api/ask"), async (route) => {
      const body = route.request().postDataJSON() as { query: string; mode: string };
      expect(body.query).toBe("What ad formats does the Playables SDK support?");
      await jsonRoute(route, 200, {
        answer: "The SDK supports playable, interstitial, and rewarded ad formats [1].",
        status: "answered",
        citations: [
          {
            id: 1,
            documentId: "22222222-2222-2222-2222-222222222222",
            documentTitle: "SDK Overview",
            sourceKey: "docs/sdk.md",
            chunkId: "11111111-1111-1111-1111-111111111111",
            quote: "Supported ad formats: playable, interstitial, rewarded."
          }
        ],
        results: [
          {
            chunkId: "11111111-1111-1111-1111-111111111111",
            documentId: "22222222-2222-2222-2222-222222222222",
            documentTitle: "SDK Overview",
            sourceKey: "docs/sdk.md",
            snippet: "Supported ad formats: playable, interstitial, rewarded.",
            score: 0.93,
            rank: 1
          }
        ],
        requestId: "req-ask-1",
        latencyMs: 42
      });
    });

    await page.goto("/");
    await page.locator(".chat-form input[type=text]").fill("What ad formats does the Playables SDK support?");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.locator(".chat-turn-answer")).toContainText("playable, interstitial, and rewarded");
    await expect(page.locator(".badge-success")).toHaveText("Answered");
    await expect(page.locator(".citation-item")).toContainText("SDK Overview");
    await expect(page.locator(".chat-turn-answer")).toContainText("42ms");
  });

  test("shows an insufficient-context badge when the answer lacks grounding", async ({ page }) => {
    await page.route(apiUrl("/api/ask"), async (route) => {
      await jsonRoute(route, 200, {
        answer: "I don't have enough information in the corpus to answer that.",
        status: "insufficient_context",
        citations: [],
        results: [],
        requestId: "req-ask-2",
        latencyMs: 15
      });
    });

    await page.goto("/");
    await page.locator(".chat-form input[type=text]").fill("What is the capital of France?");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.locator(".badge-warning")).toHaveText("Insufficient context");
    await expect(page.locator(".chat-turn-answer")).toContainText("don't have enough information");
  });
});
