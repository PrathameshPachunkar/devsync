import { expect, type Locator, type Page } from "@playwright/test";

export function column(page: Page, name: string): Locator {
  return page.getByRole("region", { name: `${name} column`, exact: true });
}

export function cardsIn(page: Page, name: string): Locator {
  return column(page, name).getByTestId("task-card");
}

/** Column names in on-screen order. */
export async function columnOrder(page: Page): Promise<string[]> {
  const labels = await page
    .getByTestId("board-column")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label") ?? ""));
  return labels.map((label) => label.replace(/ column$/, ""));
}

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.E2E_API_PORT ?? 4000}`;
export const WEB_ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 3200}`;

/**
 * Creates a private demo sandbox for this test. page.request shares the
 * browser context's cookie jar, so the page is signed in afterwards.
 */
export async function signInAsDemo(page: Page) {
  const response = await page.request.post(`${API_URL}/v1/auth/demo`, {
    headers: { Origin: WEB_ORIGIN },
  });
  expect(response.ok()).toBe(true);
}

/** Signs in to a fresh sandbox and opens a demo board by name via the sidebar. */
export async function openBoard(page: Page, boardName: string, expectedCards?: number) {
  await signInAsDemo(page);
  await page.goto("/boards");
  await page.getByRole("link", { name: boardName, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: boardName })).toBeVisible();
  await expect(page.getByTestId("board-column").first()).toBeVisible();
  if (expectedCards !== undefined) {
    await expect(page.getByTestId("task-card")).toHaveCount(expectedCards);
  }
}

/**
 * Pointer drag that dnd-kit recognizes: press, pass the 6px activation
 * distance, then glide to the target in small steps so collision detection
 * runs along the way.
 */
export async function drag(
  page: Page,
  source: Locator,
  target: Locator,
  { steps = 20, offsetY = 0 }: { steps?: number; offsetY?: number } = {},
) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag: element not visible");

  const startX = from.x + from.width / 2;
  const startY = from.y + Math.min(from.height / 2, 24);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 10, startY + 10, { steps: 2 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + offsetY, { steps });
  // Let the final collision pass and the over-preview settle.
  await page.waitForTimeout(100);
  await page.mouse.up();
}
