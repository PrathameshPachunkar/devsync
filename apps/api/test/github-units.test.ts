import { createHmac } from "node:crypto";

import { parseRepoInput } from "@devsync/shared";
import { describe, expect, it } from "vitest";

import { createSecretBox } from "../src/lib/crypto";
import { targetColumns } from "../src/modules/github/apply";
import { aggregateCheckRuns } from "../src/modules/github/client";
import { backoffMs } from "../src/modules/github/outbox";
import { verifySignature } from "../src/modules/github/webhooks";

describe("secret box (AES-256-GCM)", () => {
  const box = createSecretBox(Buffer.alloc(32, 1).toString("base64"));

  it("round-trips and uses a fresh IV every time", () => {
    const a = box.encrypt("github_pat_123");
    const b = box.encrypt("github_pat_123");
    expect(a).not.toBe(b);
    expect(box.decrypt(a)).toBe("github_pat_123");
  });

  it("rejects tampered ciphertext and the wrong key", () => {
    const sealed = box.encrypt("secret");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => box.decrypt(parts.join("."))).toThrow();
    expect(() => createSecretBox(Buffer.alloc(32, 2).toString("base64")).decrypt(sealed)).toThrow();
  });
});

describe("webhook signatures", () => {
  const body = Buffer.from('{"action":"opened"}');
  const sign = (secret: string) =>
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts the right signature only", () => {
    expect(verifySignature("s3cret", body, sign("s3cret"))).toBe(true);
    expect(verifySignature("s3cret", body, sign("other"))).toBe(false);
    expect(verifySignature("s3cret", body, undefined)).toBe(false);
    expect(verifySignature("s3cret", body, "sha1=abc")).toBe(false);
    expect(verifySignature("s3cret", Buffer.from("{}"), sign("s3cret"))).toBe(false);
  });
});

describe("check run aggregation", () => {
  it.each([
    [[], null],
    [
      [
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "skipped" },
      ],
      "success",
    ],
    [
      [
        { status: "completed", conclusion: "success" },
        { status: "in_progress", conclusion: null },
      ],
      "pending",
    ],
    [
      [
        { status: "in_progress", conclusion: null },
        { status: "completed", conclusion: "failure" },
      ],
      "failure",
    ],
    [[{ status: "completed", conclusion: "timed_out" }], "failure"],
  ] as const)("%j is %s", (runs, expected) => {
    expect(aggregateCheckRuns([...runs])).toBe(expected);
  });
});

describe("repo input parsing", () => {
  it.each([
    ["octo/repo", { owner: "octo", name: "repo" }],
    ["https://github.com/octo/repo.git", { owner: "octo", name: "repo" }],
    ["github.com/octo/repo/issues/4", { owner: "octo", name: "repo" }],
    ["  octo/re.po-1 ", { owner: "octo", name: "re.po-1" }],
  ])("%s", (input, expected) => {
    expect(parseRepoInput(input)).toEqual(expected);
  });

  it.each([
    "octo",
    "octo/",
    "../etc/passwd",
    "octo/..",
    "octo/repo name",
    "-octo/repo",
    "oc--to/repo",
  ])("rejects %s", (input) => {
    expect(parseRepoInput(input)).toBeNull();
  });
});

describe("column targeting", () => {
  const col = (id: string, position: string, state?: "open" | "closed") => ({
    id,
    position,
    githubRule: state ? { state } : null,
  });

  it("uses the first column as inbox and the last as done by default", () => {
    expect(targetColumns([col("b", "a1"), col("a", "a0"), col("c", "a2")])).toMatchObject({
      inbox: "a",
      done: "c",
    });
  });

  it("prefers the column whose rule closes issues", () => {
    const columns = [col("todo", "a0"), col("review", "a1", "closed"), col("archive", "a2")];
    expect(targetColumns(columns)).toMatchObject({ inbox: "todo", done: "review" });
  });
});

describe("outbox backoff", () => {
  it("doubles from 30s and caps at one hour", () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([30_000, 60_000, 120_000]);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});
