"use client";

import { useTheme } from "next-themes";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useIsClient } from "@/hooks/use-is-client";
import { cn } from "@/lib/utils";
import {
  isThemeMode,
  THEME_MODE_DESCRIPTIONS,
  THEME_MODE_LABELS,
  THEME_MODES,
  type ThemeMode,
} from "@/lib/theme/theme-modes";

import { THEME_MODE_ICONS } from "./theme-mode-icons";

export function ThemeModePicker() {
  const { theme, setTheme } = useTheme();
  const isClient = useIsClient();
  // "" keeps the group controlled while the stored theme is still unknown.
  const value = isClient && isThemeMode(theme) ? theme : "";

  return (
    <RadioGroup
      aria-label="Theme"
      value={value}
      onValueChange={(next) => {
        if (isThemeMode(next)) setTheme(next);
      }}
      className="grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {THEME_MODES.map((mode) => {
        const Icon = THEME_MODE_ICONS[mode];
        const id = `theme-mode-${mode}`;
        return (
          <Label
            key={mode}
            htmlFor={id}
            className="flex cursor-pointer flex-col items-stretch gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/50 has-data-checked:border-primary has-data-checked:ring-2 has-data-checked:ring-primary/30"
          >
            <ThemePreview mode={mode} />
            <span className="flex items-start gap-2">
              <RadioGroupItem value={mode} id={id} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {THEME_MODE_LABELS[mode]}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {THEME_MODE_DESCRIPTIONS[mode]}
                </span>
              </span>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

/**
 * Miniature board rendered with real tokens. `.light` and `.dark` re-declare
 * the token set on the preview element, so each card shows its true palette
 * whatever the page theme is.
 */
function ThemePreview({ mode }: { mode: ThemeMode }) {
  if (mode === "system") {
    return (
      <span aria-hidden="true" className="relative block h-24 overflow-hidden rounded-lg border">
        <MiniBoard className="light absolute inset-0" />
        <MiniBoard
          className="dark absolute inset-0"
          style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
        />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="block h-24 overflow-hidden rounded-lg border">
      <MiniBoard className={cn(mode, "h-full")} />
    </span>
  );
}

function MiniBoard({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span className={cn("flex gap-1.5 bg-board p-2", className)} style={style}>
      <span className="w-6 shrink-0 rounded-sm bg-sidebar" />
      {[3, 2, 1].map((cards, column) => (
        <span key={column} className="flex flex-1 flex-col gap-1 rounded-sm bg-column p-1">
          <span className="h-1 w-2/3 rounded-full bg-column-foreground/40" />
          {Array.from({ length: cards }, (_, card) => (
            <span key={card} className="h-3.5 rounded-[3px] border border-task-border bg-task">
              {card === 0 && column === 0 && (
                <span className="m-1 block h-1 w-1/2 rounded-full bg-primary" />
              )}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
