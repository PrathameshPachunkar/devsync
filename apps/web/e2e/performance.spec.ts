import { expect, test } from "@playwright/test";

import { cardsIn, drag, openBoard } from "./helpers";

/**
 * Drags a card across every column of the 120-card board and checks the
 * main thread stays responsive.
 *
 * - No page errors. This caught a drag-over update loop that made React
 *   abort with "Maximum update depth exceeded".
 * - No long main-thread task over 200ms (Long Tasks API).
 * - p95 frame interval under 50ms. Headless browsers rasterize in software,
 *   so frame timing is loose. The long-task check is the precise signal.
 */
test("dragging across the 120-card board keeps the main thread responsive", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openBoard(page, "DevSync Core", 120);

  await page.evaluate(() => {
    const frames: number[] = [];
    const longTasks: number[] = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    }).observe({ type: "longtask" });
    let last = performance.now();
    let running = true;
    const tick = (now: number) => {
      frames.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    Object.assign(window, {
      __stopSampling: () => {
        running = false;
        return { frames, longTasks };
      },
    });
  });

  await drag(page, cardsIn(page, "Backlog").nth(2), cardsIn(page, "Done").nth(4), { steps: 90 });

  const { frames, longTasks } = await page.evaluate(() =>
    (
      window as unknown as { __stopSampling: () => { frames: number[]; longTasks: number[] } }
    ).__stopSampling(),
  );
  const sorted = [...frames].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const longestTask = Math.max(0, ...longTasks);

  const summary = `frames=${frames.length} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms longTasks=${longTasks.length} longest=${longestTask.toFixed(0)}ms`;
  test.info().annotations.push({ type: "perf", description: summary });
  console.log(`[perf] ${summary}`);

  expect(errors).toEqual([]);
  expect(longestTask).toBeLessThan(200);
  expect(p95).toBeLessThan(50);
});
