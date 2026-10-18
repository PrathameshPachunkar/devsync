import type { AccentDto, GitHubItemDto } from "./board";

type DemoRepo = { owner: string; name: string };
import type { BoardRole } from "./permissions";

/**
 * Deterministic demo content. The API clones it into a private sandbox for
 * each "Try the demo" visitor, and web tests use it as fixtures. The same
 * template key always yields the same cards. DevSync Core is deliberately
 * large (120 cards) to exercise the render path.
 */

export interface DemoTeamMember {
  key: string;
  name: string;
  email: string;
}

export const DEMO_TEAM: readonly DemoTeamMember[] = [
  { key: "ana", name: "Ana Kovac", email: "ana@team.demo.devsync.app" },
  { key: "mo", name: "Mo Rahman", email: "mo@team.demo.devsync.app" },
  { key: "lee", name: "Lee Park", email: "lee@team.demo.devsync.app" },
  { key: "sam", name: "Sam Ortiz", email: "sam@team.demo.devsync.app" },
  { key: "jo", name: "Jo Becker", email: "jo@team.demo.devsync.app" },
  { key: "ivy", name: "Ivy Chen", email: "ivy@team.demo.devsync.app" },
];

export interface DemoLabel {
  name: string;
  color: string;
}

export const DEMO_LABELS: readonly DemoLabel[] = [
  { name: "bug", color: "d73a4a" },
  { name: "enhancement", color: "a2eeef" },
  { name: "documentation", color: "0075ca" },
  { name: "performance", color: "fbca04" },
  { name: "frontend", color: "7057ff" },
  { name: "backend", color: "0e8a16" },
  { name: "security", color: "b60205" },
];

export interface DemoCardTemplate {
  columnIndex: number;
  title: string;
  description: string | null;
  labels: DemoLabel[];
  /** DEMO_TEAM keys. */
  assignees: string[];
  commentCount: number;
  dueDate: string | null;
  github: GitHubItemDto | null;
  createdAt: string;
}

export interface DemoBoardTemplate {
  key: string;
  name: string;
  description: string;
  accent: AccentDto;
  repo: DemoRepo | null;
  /** The visitor's role, chosen to show off RBAC. */
  role: BoardRole;
  columns: { name: string; wipLimit: number | null }[];
  cards: DemoCardTemplate[];
}

const VERBS = ["Fix", "Add", "Refactor", "Document", "Optimize", "Investigate", "Test", "Migrate"];
const SUBJECTS = [
  "webhook retry backoff",
  "refresh token rotation",
  "column reorder flicker",
  "board query caching",
  "Socket.io reconnect logic",
  "GitHub label sync",
  "card drag overlay shadow",
  "RBAC middleware errors",
  "fractional index rebalance job",
  "PR checks status badge",
  "rate limiting on auth routes",
  "empty column drop target",
  "keyboard drag announcements",
  "dark theme contrast",
  "assignee avatars on cards",
  "BullMQ worker shutdown",
];
const BRANCH_PREFIXES = ["feat", "fix", "chore", "perf"];
const DESCRIPTION =
  "Repro steps and acceptance criteria live in the linked issue. Keep the change behind a feature flag until QA signs off.";

const BASE_TIME = Date.UTC(2026, 8, 1); // fixed, so templates never depend on "now"
const DAY = 86_400_000;

interface BoardSpec {
  key: string;
  name: string;
  description: string;
  accent: AccentDto;
  repo: DemoRepo | null;
  role: BoardRole;
  columns: { name: string; wipLimit: number | null; cards: number }[];
}

const BOARD_SPECS: readonly BoardSpec[] = [
  {
    key: "devsync-core",
    name: "DevSync Core",
    description: "Kanban engine, realtime sync, and the public API.",
    accent: { kind: "preset", id: "indigo" },
    repo: { owner: "devsync", name: "devsync" },
    role: "ADMIN",
    columns: [
      { name: "Backlog", wipLimit: null, cards: 45 },
      { name: "In progress", wipLimit: 20, cards: 25 },
      { name: "In review", wipLimit: 15, cards: 20 },
      { name: "Done", wipLimit: null, cards: 30 },
    ],
  },
  {
    key: "mobile-app",
    name: "Mobile App",
    description: "React Native client and push notifications.",
    accent: { kind: "preset", id: "teal" },
    repo: { owner: "devsync", name: "mobile" },
    role: "MAINTAINER",
    columns: [
      { name: "Todo", wipLimit: null, cards: 14 },
      { name: "Doing", wipLimit: 6, cards: 8 },
      { name: "QA", wipLimit: 5, cards: 6 },
      { name: "Shipped", wipLimit: null, cards: 12 },
    ],
  },
  {
    key: "marketing-site",
    name: "Marketing Site",
    description: "Landing pages, docs, and the changelog.",
    accent: { kind: "preset", id: "rose" },
    repo: null,
    role: "VIEWER",
    columns: [
      { name: "Ideas", wipLimit: null, cards: 6 },
      { name: "Writing", wipLimit: null, cards: 4 },
      { name: "Published", wipLimit: null, cards: 5 },
    ],
  },
];

/** mulberry32: small, fast, deterministic PRNG. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildTemplate(spec: BoardSpec): DemoBoardTemplate {
  const random = createRandom(hashString(spec.key));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const repo = spec.repo ? `${spec.repo.owner}/${spec.repo.name}` : null;
  const cards: DemoCardTemplate[] = [];
  let issueNumber = 100;

  spec.columns.forEach((column, columnIndex) => {
    const stage = columnIndex / Math.max(1, spec.columns.length - 1); // 0 = backlog, 1 = done
    for (let i = 0; i < column.cards; i += 1) {
      const createdAt = new Date(BASE_TIME + Math.floor(random() * 45) * DAY).toISOString();
      const labels = DEMO_LABELS.filter(() => random() < 0.18).slice(0, 3);
      const assignees = DEMO_TEAM.filter(() => random() < 0.22).slice(0, 3);
      issueNumber += 1 + Math.floor(random() * 3);

      let github: GitHubItemDto | null = null;
      if (repo && random() < 0.75) {
        const isPr = stage > 0.3 ? random() < 0.75 : random() < 0.15;
        const done = stage === 1;
        const subject = pick(SUBJECTS).replace(/\s+/g, "-").toLowerCase();
        github = {
          kind: isPr ? "pull_request" : "issue",
          number: issueNumber,
          state: done ? (isPr ? (random() < 0.9 ? "merged" : "closed") : "closed") : "open",
          isDraft: isPr && !done && stage < 0.5 && random() < 0.6,
          htmlUrl: `https://github.com/${repo}/${isPr ? "pull" : "issues"}/${issueNumber}`,
          repo,
          headRef: isPr ? `${pick(BRANCH_PREFIXES)}/${subject}` : null,
          checksStatus: isPr
            ? done
              ? "success"
              : pick(["pending", "success", "failure"] as const)
            : null,
          assignees: assignees.map((a) => ({ login: a.key, avatarUrl: null })),
        };
      }

      cards.push({
        columnIndex,
        title: `${pick(VERBS)} ${pick(SUBJECTS)}`,
        description: random() < 0.5 ? DESCRIPTION : null,
        labels,
        assignees: assignees.map((a) => a.key),
        commentCount: Math.floor(random() * 8),
        dueDate:
          random() < 0.2
            ? new Date(BASE_TIME + (30 + Math.floor(random() * 40)) * DAY).toISOString()
            : null,
        github,
        createdAt,
      });
    }
  });

  return {
    key: spec.key,
    name: spec.name,
    description: spec.description,
    accent: spec.accent,
    repo: spec.repo,
    role: spec.role,
    columns: spec.columns.map(({ name, wipLimit }) => ({ name, wipLimit })),
    cards,
  };
}

let cache: readonly DemoBoardTemplate[] | null = null;

export function demoBoardTemplates(): readonly DemoBoardTemplate[] {
  cache ??= BOARD_SPECS.map(buildTemplate);
  return cache;
}

export function demoBoardTemplate(key: string): DemoBoardTemplate | undefined {
  return demoBoardTemplates().find((template) => template.key === key);
}
