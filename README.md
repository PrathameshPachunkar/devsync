# DevSync

Collaborative Kanban boards with GitHub issue and pull request sync, per-board role-based access control, and a multi-theme UI.

> Status: Phase 2 of 5 (frontend foundation and design system). The Kanban engine, API, auth, and GitHub sync land in later phases.

## Stack

| Layer    | Choice                                                                 |
| -------- | ---------------------------------------------------------------------- |
| Monorepo | pnpm workspaces + Turborepo                                            |
| Web      | Next.js 16 (App Router, Cache Components), React 19, strict TypeScript |
| UI       | Tailwind CSS v4, shadcn/ui (Radix), Lucide                             |
| Theming  | next-themes (light / dark / system) + an OKLCH accent engine           |
| State    | TanStack Query (server state), Zustand (UI state)                      |
| Tests    | Vitest + Testing Library                                               |

## Getting started

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

| Command          | What it does                                |
| ---------------- | ------------------------------------------- |
| `pnpm dev`       | Run all apps in dev mode                    |
| `pnpm build`     | Production build                            |
| `pnpm lint`      | ESLint                                      |
| `pnpm typecheck` | Generate route types and run `tsc --noEmit` |
| `pnpm test`      | Unit tests                                  |
| `pnpm format`    | Prettier (with Tailwind class sorting)      |

## Theme engine

Every brand-tinted token in `apps/web/src/app/globals.css` derives from two CSS variables, `--brand-h` (OKLCH hue) and `--brand-c` (chroma). Light and dark mode change only lightness, so any accent works in both.

- **Global accent.** Persisted in a Zustand store. A blocking inline script applies it before first paint, so a stored accent never flashes the default color. It syncs across tabs.
- **Scoped accents.** Spread `accentScopeProps(accent)` on any element and that subtree, such as a board, gets its own accent. The data attribute it adds makes the stylesheet recompute derived tokens, because CSS variables resolve where they are declared.
- **Kanban and GitHub tokens.** `bg-board`, `bg-column`, `bg-task`, `bg-drop-indicator`, and `text-gh-open/merged/closed/draft` are first-class Tailwind colors.

## Layout

```
apps/web/src
├─ app/                 routes: (app) shell, boards, settings/appearance
├─ components/ui/       shadcn primitives
├─ components/layout/   sidebar, topbar, breadcrumbs, navigation helpers
├─ components/theme/    appearance menu, theme mode + accent pickers
├─ components/github/   GitHub state badge
├─ features/            boards, settings (feature-scoped components and data)
├─ lib/theme/           accent engine, pre-paint script, store
└─ hooks/
```
