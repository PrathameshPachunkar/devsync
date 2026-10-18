import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createPgliteDatabase, resolveMigrationsFolder } from "./client";
import { sql } from "./index";

const realFolder = resolveMigrationsFolder();
const tempRoot = mkdtempSync(join(tmpdir(), "devsync-migrations-"));

afterAll(() => {
  delete process.env.MIGRATIONS_DIR;
  rmSync(tempRoot, { recursive: true, force: true });
});

/** A copy of the migrations folder that stops after the first `count` entries. */
function folderWithFirst(count: number) {
  const dir = join(tempRoot, `first-${count}`);
  cpSync(realFolder, dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((e) => e.idx < count);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

describe("migrations", () => {
  it("upgrade a database that already holds Phase 4 data", async () => {
    const db = createPgliteDatabase();

    process.env.MIGRATIONS_DIR = folderWithFirst(1);
    await db.migrate();

    // Data shaped like a Phase 4 demo sandbox: a linked repo and GitHub items.
    // One statement per query: prepared statements can't batch.
    for (const statement of [
      `insert into users (id, name) values ('00000000-0000-4000-8000-000000000001', 'Old')`,
      `insert into boards (id, name, created_by_id) values ('00000000-0000-4000-8000-000000000002', 'Old board', '00000000-0000-4000-8000-000000000001')`,
      `insert into columns (id, board_id, name, position) values ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Todo', 'a0')`,
      `insert into cards (id, board_id, column_id, title, position) values ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'Linked', 'a0')`,
      `insert into github_items (card_id, kind, number, state, html_url, repo) values ('00000000-0000-4000-8000-000000000004', 'issue', 7, 'open', 'https://x', 'devsync/devsync')`,
      `insert into board_repos (board_id, owner, name) values ('00000000-0000-4000-8000-000000000002', 'devsync', 'devsync')`,
    ]) {
      await db.db.execute(sql.raw(statement));
    }

    delete process.env.MIGRATIONS_DIR;
    await db.migrate();

    const item = await db.db.execute(sql`select board_id from github_items`);
    expect(item.rows[0]).toEqual({ board_id: "00000000-0000-4000-8000-000000000002" });
    const repo = await db.db.execute(sql`select auth_mode, sync_status from board_repos`);
    expect(repo.rows[0]).toEqual({ auth_mode: "demo", sync_status: "idle" });
    await db.close();
  }, 30_000);
});
