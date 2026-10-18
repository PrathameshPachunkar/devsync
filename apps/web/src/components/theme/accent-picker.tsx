"use client";

import { Check, RotateCcw } from "lucide-react";
import { Slider as SliderPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAccentHydrated, useAccentStore } from "@/lib/theme/accent-store";
import {
  ACCENT_PRESET_IDS,
  ACCENT_PRESETS,
  accentSwatchColor,
  CUSTOM_ACCENT_CHROMA,
  DEFAULT_ACCENT_PRESET,
  isAccentPresetId,
  resolveAccent,
} from "@/lib/theme/accents";

const CUSTOM_VALUE = "custom";

/** Rainbow track for the hue slider, drawn at the custom accent's chroma. */
const HUE_TRACK = `linear-gradient(to right, ${Array.from(
  { length: 13 },
  (_, index) => `oklch(0.62 ${CUSTOM_ACCENT_CHROMA} ${index * 30})`,
).join(", ")})`;

export function AccentPicker() {
  const hydrated = useAccentHydrated();
  const accent = useAccentStore((state) => state.accent);
  const setPreset = useAccentStore((state) => state.setPreset);
  const setCustomHue = useAccentStore((state) => state.setCustomHue);
  const reset = useAccentStore((state) => state.reset);

  const selected = !hydrated ? "" : accent.kind === "preset" ? accent.id : CUSTOM_VALUE;
  const currentHue = resolveAccent(accent).hue;
  const isDefault = accent.kind === "preset" && accent.id === DEFAULT_ACCENT_PRESET;

  return (
    <div className="grid gap-6">
      <RadioGroup
        aria-label="Accent presets"
        value={selected}
        onValueChange={(value) => {
          if (isAccentPresetId(value)) setPreset(value);
          else if (value === CUSTOM_VALUE) setCustomHue(currentHue);
        }}
        className="grid-cols-4 gap-2 sm:grid-cols-9"
      >
        {ACCENT_PRESET_IDS.map((id) => (
          <AccentOption
            key={id}
            value={id}
            label={ACCENT_PRESETS[id].label}
            color={accentSwatchColor({ kind: "preset", id })}
          />
        ))}
        <AccentOption
          value={CUSTOM_VALUE}
          label="Custom"
          color={accentSwatchColor({ kind: "custom", hue: currentHue })}
        />
      </RadioGroup>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="accent-hue">Custom hue</Label>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {Math.round(currentHue)}°
          </span>
        </div>
        <SliderPrimitive.Root
          id="accent-hue"
          min={0}
          max={359}
          step={1}
          value={[currentHue]}
          onValueChange={([hue]) => {
            if (hue !== undefined) setCustomHue(hue);
          }}
          className="relative flex h-5 w-full touch-none items-center select-none"
        >
          <SliderPrimitive.Track
            className="relative h-2.5 grow rounded-full"
            style={{ backgroundImage: HUE_TRACK }}
          >
            <SliderPrimitive.Range className="absolute h-full" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label="Custom accent hue"
            className="block size-5 rounded-full border-2 border-white bg-primary shadow-md ring-ring/50 outline-none focus-visible:ring-4"
          />
        </SliderPrimitive.Root>
        <p className="text-xs text-muted-foreground">
          Dragging the slider switches to a custom accent. Light and dark mode adjust its lightness
          automatically.
        </p>
      </div>

      <div>
        <Button variant="outline" size="sm" onClick={reset} disabled={hydrated && isDefault}>
          <RotateCcw data-icon="inline-start" />
          Reset to default
        </Button>
      </div>
    </div>
  );
}

function AccentOption({ value, label, color }: { value: string; label: string; color: string }) {
  const id = `accent-${value}`;
  return (
    <Label
      htmlFor={id}
      className="group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-2 text-xs font-normal transition-colors hover:bg-accent/60"
    >
      {/* Visually hidden but focusable. The swatch mirrors its focus and checked state. */}
      <RadioGroupItem value={value} id={id} className="peer absolute size-px opacity-0" />
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-checked:ring-2 peer-data-checked:ring-foreground/70"
        style={{ backgroundColor: color }}
      >
        <Check
          className="size-4 text-white opacity-0 group-has-data-checked:opacity-100"
          strokeWidth={3}
        />
      </span>
      {label}
    </Label>
  );
}
