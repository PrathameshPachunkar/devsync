"use client";

import { Check, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccentStore } from "@/lib/theme/accent-store";
import {
  ACCENT_PRESET_IDS,
  ACCENT_PRESETS,
  accentSwatchColor,
  isAccentPresetId,
} from "@/lib/theme/accents";
import { isThemeMode, THEME_MODE_LABELS, THEME_MODES } from "@/lib/theme/theme-modes";

import { THEME_MODE_ICONS } from "./theme-mode-icons";

/** Topbar quick switcher: theme mode plus accent presets. */
export function AppearanceMenu() {
  const { theme, setTheme } = useTheme();
  const accent = useAccentStore((state) => state.accent);
  const setPreset = useAccentStore((state) => state.setPreset);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Appearance">
          {/* Pure CSS swap, so no hydration mismatch before the theme resolves. */}
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme ?? "system"}
          onValueChange={(value) => {
            if (isThemeMode(value)) setTheme(value);
          }}
        >
          {THEME_MODES.map((mode) => {
            const Icon = THEME_MODE_ICONS[mode];
            return (
              <DropdownMenuRadioItem key={mode} value={mode}>
                <Icon />
                {THEME_MODE_LABELS[mode]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Accent</DropdownMenuLabel>
        <DropdownMenuPrimitive.RadioGroup
          value={accent.kind === "preset" ? accent.id : ""}
          onValueChange={(value) => {
            if (isAccentPresetId(value)) setPreset(value);
          }}
          className="grid grid-cols-4 gap-1 px-1.5 pb-1.5"
        >
          {ACCENT_PRESET_IDS.map((id) => (
            <DropdownMenuPrimitive.RadioItem
              key={id}
              value={id}
              aria-label={ACCENT_PRESETS[id].label}
              // Keep the menu open so accents can be compared quickly.
              onSelect={(event) => event.preventDefault()}
              className="group flex h-9 items-center justify-center rounded-md outline-hidden focus:bg-accent"
            >
              <span
                className="flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-popover group-data-[state=checked]:ring-2 group-data-[state=checked]:ring-foreground/70"
                style={{ backgroundColor: accentSwatchColor({ kind: "preset", id }) }}
              >
                <DropdownMenuPrimitive.ItemIndicator>
                  <Check className="size-3.5 text-white" strokeWidth={3} />
                </DropdownMenuPrimitive.ItemIndicator>
              </span>
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuPrimitive.RadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/appearance">
            <Palette />
            Customize appearance
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
