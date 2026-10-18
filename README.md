# DevSync

Collaborative Kanban boards with GitHub issue and pull request sync, per-board role-based access control, and a multi-theme UI.

> Status: Phase 4 of 5 (API, auth, and RBAC). Live GitHub sync and the CI pipeline arrive in Phase 5.

## Stack

| Layer         | Choice                                                                    |
| ------------- | ------------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces + Turborepo                                               |
| Web           | Next.js 16 (App Router, Cache Components), React 19, strict TypeScript    |
| UI            | Tailwind CSS v4, shadcn/ui (Radix), Lucide                                |
| Drag and drop | @dnd-kit/core + @dnd-kit/sortable                                         |
| Client state  | TanStack Query (server state), Zustand (board view + UI state)            |
| API           | Express 5, zod validation, pino logging, helmet                           |
| Auth          | JWT access tokens (jose), rotating refresh tokens, Argon2id, GitHub OAuth |
| Database      | PostgreSQL + Drizzle ORM. Embedded PGlite for zero-setup dev and tests    |
| Ordering      | Fractional indexing, shared by client and server                          |
| Tests         | Vitest, Testing Library, Supertest, Playwright                            |

```
apps/web  ── fetch (cookies) ──▶  apps/api  ──▶  PostgreSQL (or PGlite)
   │                                 │
   └──────── packages/shared ────────┘   DTOs, zod schemas, RBAC matrix, ordering
                                     │
                              packages/db       Drizzle schema, migrations, client
```

## Getting started

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev          # web on http://localhost:3000, API on http://localhost:4000
```

No database setup is needed. Without `DATABASE_URL`, the API runs embedded PGlite (real Postgres compiled to WebAssembly) and stores data in `apps/api/.data`. For a real Postgres server, run `docker compose up -d` and set `DATABASE_URL` as shown in `apps/api/.env.example`.

Open the app and choose **Try the demo**. You get a private sandbox with three boards, one for each role: Admin, Maintainer, and Viewer.

| Command                                 | What it does                                         |
| --------------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                              | Web and API in watch mode                            |
| `pnpm build`                            | Production builds (Next.js, bundled API)             |
| `pnpm lint` / `pnpm typecheck`          | ESLint and TypeScript across every package           |
| `pnpm test`                             | Unit and API integration tests                       |
| `pnpm --filter @devsync/web test:e2e`   | Full-stack Playwright tests (run `pnpm build` first) |
| `pnpm --filter @devsync/db db:generate` | Generate a SQL migration from schema changes         |

End-to-end tests start the API on an in-memory database next to the production web build. To use an installed browser instead of downloading one, set `PW_CHANNEL=msedge` or `PW_CHANNEL=chrome`. API tests run on in-memory PGlite. Set `TEST_DATABASE_URL` to run them against a real Postgres server.

## API

Base path `/v1`. Every error has the shape `{ "error": { "code", "message", "details?" } }`. Board writes return `{ "data", "version" }`.

| Method                | Path                                    | Permission                      |
| --------------------- | --------------------------------------- | ------------------------------- |
| POST                  | `/auth/register`, `/auth/login`         | public, rate-limited            |
| POST                  | `/auth/demo`                            | public, rate-limited            |
| POST                  | `/auth/refresh`, `/auth/logout`         | refresh cookie                  |
| GET                   | `/auth/me`, `/auth/providers`           | signed in, public               |
| GET                   | `/auth/github`, `/auth/github/callback` | OAuth flow                      |
| GET                   | `/boards`                               | signed in                       |
| POST                  | `/boards`                               | signed in                       |
| GET                   | `/boards/:id`                           | `board:view`                    |
| PATCH / DELETE        | `/boards/:id`                           | `board:update` / `board:delete` |
| POST                  | `/boards/:id/columns`                   | `column:create`                 |
| PATCH                 | `/boards/:id/columns/:columnId`         | `column:rename`                 |
| POST                  | `/boards/:id/columns/:columnId/move`    | `column:reorder`                |
| DELETE                | `/boards/:id/columns/:columnId`         | `column:delete`                 |
| POST                  | `/boards/:id/cards`                     | `card:create`                   |
| PATCH                 | `/boards/:id/cards/:cardId`             | `card:edit`                     |
| POST                  | `/boards/:id/cards/:cardId/move`        | `card:move`                     |
| DELETE                | `/boards/:id/cards/:cardId`             | `card:delete`                   |
| GET                   | `/boards/:id/members`                   | `board:view`                    |
| POST / PATCH / DELETE | `/boards/:id/members[/:userId]`         | `member:manage`                 |

| Permission                                 | Admin | Maintainer | Viewer |
| ------------------------------------------ | :---: | :--------: | :----: |
| View board and members                     |   ✓   |     ✓      |   ✓    |
| Create, edit, move, and delete cards       |   ✓   |     ✓      |        |
| Create, rename, and reorder columns        |   ✓   |     ✓      |        |
| Delete columns, update or delete the board |   ✓   |            |        |
| Manage members and roles                   |   ✓   |            |        |

The matrix lives in `packages/shared/src/permissions.ts`. The API enforces it in one middleware, and the web app reads the same table to hide controls.

### Auth and security design

- **Short-lived access tokens.** HS256 JWTs last 15 minutes, in an httpOnly cookie. API clients can send `Authorization: Bearer` instead.
- **Rotating refresh tokens.** Each refresh token is opaque, lasts 14 days, and is stored only as a SHA-256 hash. Every refresh issues a new token in the same family. Replaying a rotated token revokes the whole family. A 15-second grace window means two tabs refreshing at once is not mistaken for theft.
- **Cookies.** Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. The refresh cookie is scoped to `/v1/auth`. A separate readable `devsync_session` cookie holds no secret. It only tells the web app's route guard whether to render or redirect.
- **CSRF.** Cookie-authenticated writes must come from an allowed `Origin`. CORS allows only the configured web origins.
- **Passwords.** Argon2id with OWASP parameters. Unknown emails take the same time as wrong passwords and return the same error.
- **RBAC.** Non-members get 404, not 403, so board ids can't be probed. Boards always keep at least one admin, checked under row locks.
- **GitHub OAuth.** State cookie compared in constant time. Same-site `next` redirects only. Accounts link by GitHub id, then by verified email.
- **Hardening.** helmet headers, rate limits on credential endpoints, 100 KB JSON body limit, and logs that redact cookies and authorization headers.

### Writes and ordering

Every board write runs in a transaction that first increments the board's `version`. That UPDATE locks the board row, so concurrent drops on the same board run one after another. Each response carries a strictly increasing version. The client sends neighbor ids, and the server computes the fractional key from its own rows with the same `placeAmong` function the optimistic client update uses. If the anchor is gone, the server answers 409 and the client refetches. When keys grow past 64 characters, the column is rebalanced in the same transaction.

## Kanban engine

- **Columns.** Create, rename (menu or double-click), delete with confirmation, and drag to reorder by the grip handle.
- **Cards.** Drag within or across columns, including into empty columns. Click or press Enter to open details. Press Space to pick up with the keyboard, then use the arrow keys, Space to drop, and Escape to cancel.
- **Optimistic writes.** Every change applies instantly and rolls back with a toast if the server rejects it.

### Performance design

The demo board has 120 cards. These choices keep drags responsive:

1. **Normalized view store with structural sharing.** Each card subscribes to `cards[id]` and each column to `columns[id]`. Unchanged objects keep their identity across syncs.
2. **Split memo boundaries.** A thin sortable shell absorbs drag-event re-renders. The memoized card body renders plain DOM only.
3. **Stable handlers.** Drag state is read with `getState()` inside stable callbacks, so `DndContext` never gets new props mid-drag.
4. **Scoped previews.** Same-column moves are pure CSS transforms. Cross-column hovers touch only the two columns involved.
5. **Lazy overlays.** Task details, analytics, members, the GitHub sync drawer, and the delete dialog are separate chunks, preloaded on hover or focus.

Render-count tests assert that editing one card re-renders one card body, and that moving a card re-renders two column lists and no other card. A Playwright test drags across the full board and fails on any page error or any main-thread task over 200ms.

## Theme engine

Every brand-tinted token in `apps/web/src/app/globals.css` derives from two CSS variables, `--brand-h` (OKLCH hue) and `--brand-c` (chroma). Light and dark mode change only lightness, so any accent works in both. A blocking inline script applies the saved accent before first paint. Spreading `accentScopeProps(accent)` on a subtree, such as a board, gives it its own accent.

## Layout

```
packages/
├─ shared/src        DTOs, zod schemas, RBAC matrix, ordering, demo templates
└─ db/               Drizzle schema, SQL migrations (drizzle/), Postgres + PGlite client
apps/
├─ api/src
│  ├─ middleware/    authenticate, requireBoardPermission, origin check, errors, rate limit
│  ├─ modules/auth/  tokens, sessions, passwords, cookies, GitHub OAuth, demo sandbox
│  ├─ modules/boards/ board read model, boards/columns/cards/members services and router
│  └─ lib/           board write transaction, rebalancing, HTTP errors
├─ api/test/         Supertest integration tests on in-memory Postgres
└─ web/src
   ├─ app/           (auth) login and register, (app) shell, boards, settings
   ├─ features/auth/ session hooks, auth gate, forms
   ├─ features/board/ Kanban engine (api, model, store, dnd, components)
   ├─ features/boards/ board list, create, members API
   ├─ lib/api/       fetch client with single-flight token refresh
   └─ proxy.ts       route guard
```
