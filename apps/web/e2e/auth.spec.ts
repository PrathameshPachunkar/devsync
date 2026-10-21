import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { signInAsDemo } from "./helpers";

test.describe("authentication", () => {
  test("sends signed-out visitors to sign in, then back where they were going", async ({
    page,
  }) => {
    await page.goto("/settings/appearance");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fappearance/);

    await page.getByRole("button", { name: "Explore as guest" }).click();
    await expect(page).toHaveURL(/\/settings\/appearance$/);
    await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  });

  test("registers, signs out, and signs back in with a password", async ({ page }) => {
    const email = `e2e-${randomUUID()}@example.test`;
    await page.goto("/register");
    await page.getByLabel("Name").fill("Erin Example");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Use at least 10 characters")).toBeVisible();

    await page.getByLabel("Password").fill("correct horse battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/boards$/);
    await expect(page.getByRole("link", { name: "My first board", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/boards");
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong password!!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Email or password is incorrect" }),
    ).toBeVisible();

    await page.getByLabel("Password").fill("correct horse battery");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/boards$/);
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Erin Example");
  });

  test("creates a board from the board list", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/boards");
    await page.getByRole("button", { name: "New board" }).click();
    await page.getByLabel("Name").fill("Launch plan");
    await page.getByRole("button", { name: "Create board" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Launch plan" })).toBeVisible();
    await expect(page.getByTestId("board-column")).toHaveCount(3);
  });

  test("shows not-found for boards the user cannot access", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto(`/boards/${randomUUID()}`);
    await expect(page.getByText("Board not found")).toBeVisible();
  });

  test("admins manage members and roles", async ({ page }) => {
    // A second account to invite.
    const email = `teammate-${randomUUID()}@example.test`;
    const register = await page.request.post(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/auth/register`,
      {
        headers: { Origin: `http://localhost:${process.env.E2E_PORT ?? 3200}` },
        data: { name: "Tara Teammate", email, password: "correct horse battery" },
      },
    );
    expect(register.ok()).toBe(true);
    await page.context().clearCookies();

    await signInAsDemo(page);
    await page.goto("/boards");
    await page.getByRole("link", { name: "DevSync Core", exact: true }).click();
    await page.getByRole("button", { name: "Members" }).click();
    const dialog = page.getByRole("dialog", { name: "Members" });
    await dialog.getByLabel("Invite by email").fill(email);
    await dialog.getByRole("button", { name: "Invite" }).click();

    const row = dialog.getByRole("listitem").filter({ hasText: "Tara Teammate" });
    await expect(row).toBeVisible();
    await row.getByLabel("Role for Tara Teammate").selectOption("VIEWER");
    await expect(row.getByLabel("Role for Tara Teammate")).toHaveValue("VIEWER");
    await row.getByRole("button", { name: "Remove Tara Teammate" }).click();
    await expect(row).toHaveCount(0);
  });
});
