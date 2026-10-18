import { expect, test } from "@playwright/test";

import { openBoard } from "./helpers";

test.describe("GitHub sync drawer", () => {
  test("shows demo mode, saves column rules, and validates links", async ({ page }) => {
    await openBoard(page, "DevSync Core", 120);
    await page.getByRole("button", { name: "devsync/devsync" }).click();
    const drawer = page.getByRole("dialog", { name: "GitHub sync" });

    await expect(drawer.getByText("Demo data")).toBeVisible();
    await expect(drawer.getByText("Sample data. Not connected to GitHub.")).toBeVisible();
    // Demo boards never sync, so no "Sync now".
    await expect(drawer.getByRole("button", { name: "Sync now" })).toHaveCount(0);

    // Linking a real repo validates input before calling the API.
    await drawer.getByRole("button", { name: "Link a real repository" }).click();
    await drawer.getByLabel("Repository").fill("../etc/passwd");
    await drawer.getByRole("button", { name: "Link and sync" }).click();
    await expect(drawer.getByRole("alert")).toHaveText("Use owner/name or a GitHub URL");
  });

  test("admins edit column rules and they persist", async ({ page }) => {
    await openBoard(page, "DevSync Core", 120);
    await page.getByRole("button", { name: "devsync/devsync" }).click();
    let drawer = page.getByRole("dialog", { name: "GitHub sync" });
    await drawer.getByLabel("GitHub state when moved to Done").selectOption("closed");
    await drawer.getByLabel("Labels to add when moved to Done").fill("shipped, released");
    await drawer.getByLabel("Labels to add when moved to Done").press("Enter");
    await page.waitForLoadState("networkidle");

    await page.reload();
    await page.getByRole("button", { name: "devsync/devsync" }).click();
    drawer = page.getByRole("dialog", { name: "GitHub sync" });
    await expect(drawer.getByLabel("GitHub state when moved to Done")).toHaveValue("closed");
    await expect(drawer.getByLabel("Labels to add when moved to Done")).toHaveValue(
      "shipped, released",
    );
  });

  test("maintainers see rules read-only and unlinked boards offer the link form", async ({
    page,
  }) => {
    await openBoard(page, "Mobile App");
    await page.getByRole("button", { name: "devsync/mobile" }).click();
    const drawer = page.getByRole("dialog", { name: "GitHub sync" });
    await expect(drawer.getByRole("list", { name: "Column rules" })).toBeVisible();
    await expect(drawer.getByRole("combobox")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto("/boards");
    await page.getByRole("button", { name: "New board" }).click();
    await page.getByLabel("Name").fill("Release train");
    await page.getByRole("button", { name: "Create board" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Release train" })).toBeVisible();
    await page.getByRole("button", { name: "GitHub", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "GitHub sync" }).getByLabel("Repository"),
    ).toBeVisible();
  });
});
