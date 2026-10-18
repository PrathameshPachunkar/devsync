import { expect, test } from "@playwright/test";

import { cardsIn, column, columnOrder, drag, openBoard } from "./helpers";

test.describe("Kanban board", () => {
  test("renders the 120-card demo board", async ({ page }) => {
    await openBoard(page, "DevSync Core", 120);
    expect(await columnOrder(page)).toEqual(["Backlog", "In progress", "In review", "Done"]);
    await expect(page.getByText("120 cards")).toBeVisible();
  });

  test("drags a card into another column and persists it", async ({ page }) => {
    await openBoard(page, "DevSync Core", 120);
    const card = cardsIn(page, "Backlog").first();
    const title = (await card.locator("h3").textContent())!;
    const target = cardsIn(page, "In progress").nth(1);
    const beforeCount = await cardsIn(page, "In progress").count();

    await drag(page, card, target);

    await expect(cardsIn(page, "In progress")).toHaveCount(beforeCount + 1);
    await expect(column(page, "In progress").getByText(title, { exact: true })).toBeVisible();

    // Persisted by the API: a reload fetches it back from Postgres.
    await expect(page.getByText("Couldn't move card")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(cardsIn(page, "In progress")).toHaveCount(beforeCount + 1);
    await expect(column(page, "In progress").getByText(title, { exact: true })).toBeVisible();
  });

  test("drops a card into an empty column", async ({ page }) => {
    // Wide enough that the new fifth column is on screen next to Todo.
    await page.setViewportSize({ width: 1920, height: 1000 });
    await openBoard(page, "Mobile App");
    await page.getByRole("button", { name: "Add column" }).click();
    await page.getByLabel("New column name").fill("Blocked");
    await page.getByLabel("New column name").press("Enter");
    await expect(column(page, "Blocked")).toBeVisible();

    const card = cardsIn(page, "Todo").first();
    await drag(page, card, column(page, "Blocked"));
    await expect(cardsIn(page, "Blocked")).toHaveCount(1);
  });

  test("reorders columns with the drag handle", async ({ page }) => {
    await openBoard(page, "DevSync Core", 120);
    await drag(
      page,
      page.getByRole("button", { name: "Reorder column Done" }),
      page.getByRole("button", { name: "Reorder column Backlog" }),
      { steps: 30 },
    );
    await expect
      .poll(() => columnOrder(page))
      .toEqual(["Done", "Backlog", "In progress", "In review"]);
  });

  test("moves a card with the keyboard", async ({ page }) => {
    await openBoard(page, "Mobile App");
    const first = cardsIn(page, "Todo").first();
    const title = (await first.locator("h3").textContent())!;

    // Pause between keys like a person would. dnd-kit attaches its keyboard
    // listeners just after pickup.
    await first.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
    await page.keyboard.press("Space");

    await expect(cardsIn(page, "Todo").nth(1).locator("h3")).toHaveText(title);
  });

  test("creates, renames, and deletes a column", async ({ page }) => {
    await openBoard(page, "DevSync Core", 120);

    await page.getByRole("button", { name: "Add column" }).click();
    await page.getByLabel("New column name").fill("Blocked");
    await page.getByLabel("New column name").press("Enter");
    await expect(column(page, "Blocked")).toBeVisible();

    await page.getByRole("button", { name: "Blocked column actions" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByLabel("Column name", { exact: true }).fill("Waiting on review");
    await page.getByLabel("Column name", { exact: true }).press("Enter");
    await expect(column(page, "Waiting on review")).toBeVisible();

    await page.getByRole("button", { name: "Waiting on review column actions" }).click();
    await page.getByRole("menuitem", { name: "Delete column" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete column" }).click();
    await expect(column(page, "Waiting on review")).toHaveCount(0);
  });

  test("adds a card and edits it in the lazy-loaded details dialog", async ({ page }) => {
    await openBoard(page, "Mobile App");
    const todo = column(page, "Todo");
    await todo.getByRole("button", { name: "Add card" }).click();
    await page.getByLabel("New card title in Todo").fill("Write release notes");
    await page.getByLabel("New card title in Todo").press("Enter");
    await page.getByLabel("New card title in Todo").press("Escape");

    await todo.getByText("Write release notes").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Title").fill("Write release notes for 2.0");
    await dialog.getByLabel("Description").click();
    await page.keyboard.press("Escape");

    await expect(todo.getByText("Write release notes for 2.0")).toBeVisible();
  });

  test("viewers cannot edit", async ({ page }) => {
    await openBoard(page, "Marketing Site");
    await expect(page.getByText("View only")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add column" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Reorder column/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add card" })).toHaveCount(0);
  });

  test("rolls back a move the server rejects", async ({ page }) => {
    await openBoard(page, "Mobile App");
    // Simulate an outage for this one endpoint.
    await page.route("**/v1/boards/*/cards/*/move", (route) =>
      route.fulfill({
        status: 503,
        json: { error: { code: "unavailable", message: "Service unavailable" } },
      }),
    );
    const card = cardsIn(page, "Todo").first();
    const title = (await card.locator("h3").textContent())!;

    await drag(page, card, cardsIn(page, "Doing").first());

    await expect(page.getByText("Couldn't move card")).toBeVisible();
    await expect(cardsIn(page, "Todo").first().locator("h3")).toHaveText(title);
    await expect(column(page, "Doing").getByText(title, { exact: true })).toHaveCount(0);
  });

  test("opens analytics and GitHub sync panels", async ({ page }) => {
    await openBoard(page, "DevSync Core", 120);
    await page.getByRole("button", { name: "Analytics" }).click();
    await expect(page.getByRole("dialog", { name: "Board analytics" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Backlog" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "devsync/devsync" }).click();
    await expect(page.getByRole("dialog", { name: "GitHub sync" })).toBeVisible();
  });
});
