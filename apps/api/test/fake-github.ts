/**
 * A small, stateful stand-in for api.github.com. It implements just the
 * endpoints DevSync calls, with real pagination (Link headers), auth checks,
 * and rate limiting, so the integration tests exercise the actual client code.
 */

export const FAKE_GITHUB_URL = "http://github.test";

interface FakeItem {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  updatedAt: number;
  isPull: boolean;
  draft: boolean;
  mergedAt: string | null;
  head: { ref: string; sha: string };
}

interface FakeRepo {
  id: number;
  owner: string;
  name: string;
  private: boolean;
  items: Map<number, FakeItem>;
  /** Tokens allowed to read (private repos) and to write. */
  readers: Set<string>;
  writers: Set<string>;
  installationId: number | null;
  hooks: Map<number, { url: string; secret: string }>;
}

type Handler = (
  match: RegExpMatchArray,
  req: { method: string; url: URL; token: string | null; body: unknown },
) => Response | Promise<Response>;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const notFound = () => json({ message: "Not Found" }, 404);

export class FakeGitHub {
  readonly repos = new Map<string, FakeRepo>();
  readonly checkRuns = new Map<string, { status: string; conclusion: string | null }[]>();
  readonly calls: { method: string; path: string; token: string | null }[] = [];
  /** Next failure to inject, keyed by "METHOD path-regex". */
  readonly failures: { method: string; pattern: RegExp; status: number; remaining?: number }[] = [];
  rateLimited = false;
  private clock = Date.UTC(2026, 9, 1);
  private nextId = 1000;

  addRepo(
    fullName: string,
    options: {
      private?: boolean;
      readers?: string[];
      writers?: string[];
      installationId?: number;
    } = {},
  ) {
    const [owner, name] = fullName.split("/") as [string, string];
    const repo: FakeRepo = {
      id: this.nextId++,
      owner,
      name,
      private: options.private ?? false,
      items: new Map(),
      readers: new Set([...(options.readers ?? []), ...(options.writers ?? [])]),
      writers: new Set(options.writers ?? []),
      installationId: options.installationId ?? null,
      hooks: new Map(),
    };
    this.repos.set(fullName.toLowerCase(), repo);
    return repo;
  }

  tick() {
    this.clock += 60_000;
    return this.clock;
  }

  addItem(fullName: string, item: Partial<FakeItem> & { title: string }): FakeItem {
    const repo = this.repo(fullName)!;
    const number = item.number ?? repo.items.size + 1;
    const full: FakeItem = {
      number,
      body: null,
      state: "open",
      labels: [],
      assignees: [],
      isPull: false,
      draft: false,
      mergedAt: null,
      head: { ref: `feature/${number}`, sha: `sha${number}` },
      ...item,
      updatedAt: this.tick(),
    };
    repo.items.set(number, full);
    return full;
  }

  update(fullName: string, number: number, patch: Partial<FakeItem>) {
    const item = this.repo(fullName)!.items.get(number)!;
    Object.assign(item, patch, { updatedAt: this.tick() });
    return item;
  }

  repo(fullName: string) {
    return this.repos.get(fullName.toLowerCase());
  }

  /** The JSON GitHub would send for an issue (as in webhooks and the issues API). */
  issueJson(fullName: string, item: FakeItem) {
    const repo = this.repo(fullName)!;
    return {
      number: item.number,
      title: item.title,
      body: item.body,
      state: item.state,
      html_url: `https://github.com/${repo.owner}/${repo.name}/${item.isPull ? "pull" : "issues"}/${item.number}`,
      updated_at: new Date(item.updatedAt).toISOString(),
      labels: item.labels.map((name) => ({ name, color: "ededed" })),
      assignees: item.assignees.map((login) => ({
        login,
        avatar_url: `https://avatars.test/${login}`,
      })),
      ...(item.isPull ? { pull_request: { merged_at: item.mergedAt } } : {}),
    };
  }

  pullJson(fullName: string, item: FakeItem) {
    const { pull_request: _ignored, ...issue } = this.issueJson(fullName, item);
    return { ...issue, draft: item.draft, merged_at: item.mergedAt, head: item.head };
  }

  private canRead(repo: FakeRepo, token: string | null) {
    return !repo.private || (token !== null && repo.readers.has(token));
  }

  private page<T>(items: T[], url: URL) {
    const perPage = Number(url.searchParams.get("per_page") ?? 30);
    const page = Number(url.searchParams.get("page") ?? 1);
    const slice = items.slice((page - 1) * perPage, page * perPage);
    const headers: Record<string, string> = {};
    if (page * perPage < items.length) {
      const next = new URL(url);
      next.searchParams.set("page", String(page + 1));
      headers.link = `<${next}>; rel="next"`;
    }
    return json(slice, 200, headers);
  }

  private readonly routes: [string, RegExp, Handler][] = [
    [
      "GET",
      /^\/repos\/([^/]+)\/([^/]+)$/,
      ([, o, n], { token }) => {
        const repo = this.repo(`${o}/${n}`);
        if (!repo || !this.canRead(repo, token)) return notFound();
        return json({
          id: repo.id,
          name: repo.name,
          full_name: `${repo.owner}/${repo.name}`,
          private: repo.private,
          html_url: `https://github.com/${repo.owner}/${repo.name}`,
          owner: { login: repo.owner },
          ...(token ? { permissions: { push: repo.writers.has(token) } } : {}),
        });
      },
    ],
    [
      "GET",
      /^\/repos\/([^/]+)\/([^/]+)\/issues$/,
      ([, o, n], { url, token }) => {
        const repo = this.repo(`${o}/${n}`);
        if (!repo || !this.canRead(repo, token)) return notFound();
        const state = url.searchParams.get("state") ?? "open";
        const since = url.searchParams.get("since");
        const items = [...repo.items.values()]
          .filter((i) => state === "all" || i.state === state)
          .filter((i) => !since || i.updatedAt >= Date.parse(since))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((i) => this.issueJson(`${o}/${n}`, i));
        return this.page(items, url);
      },
    ],
    [
      "GET",
      /^\/repos\/([^/]+)\/([^/]+)\/pulls$/,
      ([, o, n], { url, token }) => {
        const repo = this.repo(`${o}/${n}`);
        if (!repo || !this.canRead(repo, token)) return notFound();
        const state = url.searchParams.get("state") ?? "open";
        const items = [...repo.items.values()]
          .filter((i) => i.isPull && (state === "all" || i.state === state))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((i) => this.pullJson(`${o}/${n}`, i));
        return this.page(items, url);
      },
    ],
    [
      "GET",
      /^\/repos\/([^/]+)\/([^/]+)\/commits\/([^/]+)\/check-runs$/,
      ([, , , sha]) => json({ total_count: 0, check_runs: this.checkRuns.get(sha!) ?? [] }),
    ],
    [
      "PATCH",
      /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/,
      ([, o, n, num], { token, body }) => {
        const repo = this.repo(`${o}/${n}`);
        if (!repo || !token || !repo.writers.has(token))
          return json({ message: "Resource not accessible" }, 403);
        const item = repo.items.get(Number(num));
        if (!item) return notFound();
        this.update(`${o}/${n}`, item.number, {
          state: (body as { state: "open" | "closed" }).state,
        });
        return json(this.issueJson(`${o}/${n}`, item));
      },
    ],
    [
      "POST",
      /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/labels$/,
      ([, o, n, num], { token, body }) => {
        const repo = this.repo(`${o}/${n}`);
        if (!repo || !token || !repo.writers.has(token)) return json({ message: "Forbidden" }, 403);
        const item = repo.items.get(Number(num))!;
        const added = (body as { labels: string[] }).labels;
        this.update(`${o}/${n}`, item.number, { labels: [...new Set([...item.labels, ...added])] });
        return json(item.labels.map((name) => ({ name, color: "ededed" })));
      },
    ],
    [
      "DELETE",
      /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/labels\/(.+)$/,
      ([, o, n, num, label], { token }) => {
        const repo = this.repo(`${o}/${n}`);
        if (!repo || !token || !repo.writers.has(token)) return json({ message: "Forbidden" }, 403);
        const item = repo.items.get(Number(num))!;
        const name = decodeURIComponent(label!);
        if (!item.labels.includes(name)) return notFound();
        this.update(`${o}/${n}`, item.number, { labels: item.labels.filter((l) => l !== name) });
        return json([]);
      },
    ],
    [
      "POST",
      /^\/repos\/([^/]+)\/([^/]+)\/hooks$/,
      ([, o, n], { token, body }) => {
        const repo = this.repo(`${o}/${n}`);
        if (!repo || !token || !repo.writers.has(token)) return json({ message: "Forbidden" }, 403);
        const id = this.nextId++;
        const config = (body as { config: { url: string; secret: string } }).config;
        repo.hooks.set(id, { url: config.url, secret: config.secret });
        return json({ id }, 201);
      },
    ],
    [
      "DELETE",
      /^\/repos\/([^/]+)\/([^/]+)\/hooks\/(\d+)$/,
      ([, o, n, id]) => {
        this.repo(`${o}/${n}`)?.hooks.delete(Number(id));
        return new Response(null, { status: 204 });
      },
    ],
    [
      "GET",
      /^\/repos\/([^/]+)\/([^/]+)\/installation$/,
      ([, o, n], { token }) => {
        if (!token || token.split(".").length !== 3)
          return json({ message: "A JSON web token could not be decoded" }, 401);
        const repo = this.repo(`${o}/${n}`);
        return repo?.installationId ? json({ id: repo.installationId }) : notFound();
      },
    ],
    [
      "POST",
      /^\/app\/installations\/(\d+)\/access_tokens$/,
      ([, id], { token }) => {
        if (!token || token.split(".").length !== 3) return json({ message: "Bad JWT" }, 401);
        const installToken = `ghs_installation_${id}`;
        for (const repo of this.repos.values()) {
          if (repo.installationId === Number(id)) {
            repo.readers.add(installToken);
            repo.writers.add(installToken);
          }
        }
        return json(
          { token: installToken, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
          201,
        );
      },
    ],
  ];

  readonly fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const auth = new Headers(init?.headers).get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    this.calls.push({ method, path: `${url.pathname}${url.search}`, token });

    if (this.rateLimited) {
      return json({ message: "API rate limit exceeded" }, 403, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600),
      });
    }
    const failure = this.failures.find((f) => f.method === method && f.pattern.test(url.pathname));
    if (failure) {
      if (failure.remaining !== undefined && --failure.remaining <= 0) {
        this.failures.splice(this.failures.indexOf(failure), 1);
      }
      return json({ message: `Injected ${failure.status}` }, failure.status);
    }

    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    for (const [m, pattern, handler] of this.routes) {
      const match = url.pathname.match(pattern);
      if (m === method && match) return handler(match, { method, url, token, body });
    }
    return notFound();
  }) as typeof fetch;
}
