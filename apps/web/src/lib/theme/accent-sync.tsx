"use client";

import { useEffect } from "react";

import { ACCENT_STORAGE_KEY, applyAccent } from "./accents";
import { useAccentStore } from "./accent-store";

/**
 * Bridges the accent store to the DOM:
 *  - rehydrates the persisted accent after mount
 *  - writes --brand-h / --brand-c on <html> whenever the accent changes
 *  - follows changes made in other tabs via the `storage` event
 */
export function AccentSync(): null {
  useEffect(() => {
    const unsubscribe = useAccentStore.subscribe((state, previous) => {
      if (state.accent !== previous.accent) {
        applyAccent(document.documentElement, state.accent);
      }
    });

    void useAccentStore.persist.rehydrate();

    const onStorage = (event: StorageEvent) => {
      if (event.key === ACCENT_STORAGE_KEY) void useAccentStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
