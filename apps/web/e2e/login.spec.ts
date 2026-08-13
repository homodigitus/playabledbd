import { expect, test } from "@playwright/test";
import { apiUrl, jsonRoute, plainUser } from "./fixtures.js";

test.describe("login", () => {
  test("successful login redirects to the chat page and shows the user in the nav bar", async ({ page }) => {
    let loggedIn = false;

    await page.route(apiUrl("/api/auth/me"), async (route) => {
      await jsonRoute(route, 200, { user: loggedIn ? plainUser : null });
    });

    await page.route(apiUrl("/api/auth/login"), async (route) => {
      const body = route.request().postDataJSON() as { email: string; password: string };
      expect(body.email).toBe(plainUser.email);
      loggedIn = true;
      await jsonRoute(route, 200, { user: plainUser });
    });

    await page.goto("/login");
    await page.locator("#email").fill(plainUser.email);
    await page.locator("#password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.locator(".nav-user")).toContainText(plainUser.name);
  });

  test("failed login shows an error banner and stays on the login page", async ({ page }) => {
    await page.route(apiUrl("/api/auth/me"), async (route) => {
      await jsonRoute(route, 200, { user: null });
    });

    await page.route(apiUrl("/api/auth/login"), async (route) => {
      await jsonRoute(route, 401, {
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password.", requestId: "req-1" }
      });
    });

    await page.goto("/login");
    await page.locator("#email").fill(plainUser.email);
    await page.locator("#password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator(".error-banner")).toHaveText("Invalid email or password.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("visiting the chat page while unauthenticated redirects to /login", async ({ page }) => {
    await page.route(apiUrl("/api/auth/me"), async (route) => {
      await jsonRoute(route, 200, { user: null });
    });

    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
  });
});
