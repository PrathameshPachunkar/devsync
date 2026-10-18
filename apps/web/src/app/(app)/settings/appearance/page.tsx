import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { AccentPicker } from "@/components/theme/accent-picker";
import { ThemeModePicker } from "@/components/theme/theme-mode-picker";
import { DesignPreview } from "@/features/settings/components/design-preview";

export const metadata: Metadata = { title: "Appearance" };

export default function AppearancePage() {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Appearance"
        description="Theme and accent are saved on this device. Boards can also carry their own accent."
      />
      <SettingsSection title="Theme" description="Choose how DevSync looks.">
        <ThemeModePicker />
      </SettingsSection>
      <SettingsSection
        title="Accent"
        description="One hue drives buttons, focus rings, the sidebar, and board surfaces."
      >
        <AccentPicker />
      </SettingsSection>
      <SettingsSection title="Preview" description="Live components using the current tokens.">
        <DesignPreview />
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6">
      <div className="grid gap-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
