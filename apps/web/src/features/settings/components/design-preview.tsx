import { GitBranch, MessageSquare } from "lucide-react";

import { GitHubStateBadge } from "@/components/github/github-state-badge";
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";

const TOKENS = [
  { name: "primary", className: "bg-primary" },
  { name: "secondary", className: "bg-secondary" },
  { name: "accent", className: "bg-accent" },
  { name: "muted", className: "bg-muted" },
  { name: "board", className: "bg-board" },
  { name: "column", className: "bg-column" },
  { name: "task", className: "bg-task" },
  { name: "destructive", className: "bg-destructive" },
  { name: "success", className: "bg-success" },
  { name: "warning", className: "bg-warning" },
] as const;

/** Live sampler of the design system. Everything here re-themes with mode and accent. */
export function DesignPreview() {
  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h3 className="text-sm font-medium">Tokens</h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TOKENS.map((token) => (
            <li key={token.name} className="flex items-center gap-2 text-xs">
              <span className={`size-6 shrink-0 rounded-md border ${token.className}`} />
              <code className="truncate font-mono text-muted-foreground">{token.name}</code>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3">
        <h3 className="text-sm font-medium">Controls</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete column</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Maintainer</Badge>
          <Badge variant="outline">bug</Badge>
          <GitHubStateBadge kind="issue" state="open" />
          <GitHubStateBadge kind="issue" state="closed" />
          <GitHubStateBadge kind="pull_request" state="open" isDraft />
          <GitHubStateBadge kind="pull_request" state="open" />
          <GitHubStateBadge kind="pull_request" state="merged" />
          <GitHubStateBadge kind="pull_request" state="closed" />
        </div>
        <div className="grid max-w-sm gap-2">
          <Label htmlFor="preview-input">Card title</Label>
          <Input id="preview-input" placeholder="Fix flaky webhook retry test" />
          <p className="text-xs text-muted-foreground">
            Press <Kbd>Ctrl</Kbd> <Kbd>B</Kbd> to toggle the sidebar.
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="text-sm font-medium">Kanban surfaces</h3>
        <div className="flex gap-3 overflow-x-auto rounded-xl bg-board p-3">
          <div className="flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-column p-2">
            <div className="flex items-center justify-between px-1.5 py-1">
              <span className="text-xs font-medium tracking-wide text-column-foreground uppercase">
                In review
              </span>
              <span className="text-xs text-column-foreground tabular-nums">2</span>
            </div>
            <SampleTask
              title="Rotate refresh tokens on reuse detection"
              meta="#128"
              badge={<GitHubStateBadge kind="pull_request" state="open" />}
              branch="feat/token-rotation"
            />
            <div aria-hidden="true" className="h-0.5 rounded-full bg-drop-indicator" />
            <SampleTask
              title="Board columns jitter while dragging"
              meta="#131"
              badge={<GitHubStateBadge kind="issue" state="open" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SampleTask({
  title,
  meta,
  badge,
  branch,
}: {
  title: string;
  meta: string;
  badge: React.ReactNode;
  branch?: string;
}) {
  return (
    <article className="grid gap-2.5 rounded-lg border border-task-border bg-task p-3 text-task-foreground shadow-xs">
      <div className="flex items-center justify-between gap-2">
        {badge}
        <span className="font-mono text-xs text-muted-foreground">{meta}</span>
      </div>
      <h4 className="text-sm leading-snug font-medium">{title}</h4>
      {branch && (
        <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <GitBranch className="size-3" aria-hidden="true" />
          {branch}
        </span>
      )}
      <div className="flex items-center justify-between">
        <AvatarGroup>
          <Avatar className="size-6">
            <AvatarFallback className="text-[10px]">AK</AvatarFallback>
          </Avatar>
          <Avatar className="size-6">
            <AvatarFallback className="text-[10px]">MR</AvatarFallback>
          </Avatar>
        </AvatarGroup>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="size-3" aria-hidden="true" />3
        </span>
      </div>
    </article>
  );
}
