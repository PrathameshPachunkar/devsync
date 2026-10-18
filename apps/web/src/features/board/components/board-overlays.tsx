"use client";

import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import {
  LazyBoardAnalyticsDialog,
  LazyGitHubSyncDrawer,
  LazyMembersDialog,
  LazyTaskDetailsDialog,
} from "../lazy";
import { useBoardActions, useBoardStore } from "../store/board-store";

/**
 * Hosts the lazy-loaded overlays. Nothing is mounted or downloaded until it
 * is opened, and each has its own Suspense boundary so a slow chunk never
 * blocks the board.
 */
export function BoardOverlays() {
  const openCardId = useBoardStore((state) => state.openCardId);
  const panel = useBoardStore((state) => state.panel);
  const { openCard, setPanel } = useBoardActions();
  const closePanel = () => setPanel(null);

  return (
    <>
      {openCardId && (
        <Suspense fallback={<OverlayFallback label="Loading card details" />}>
          <LazyTaskDetailsDialog
            key={openCardId}
            cardId={openCardId}
            onClose={() => openCard(null)}
          />
        </Suspense>
      )}
      {panel === "analytics" && (
        <Suspense fallback={<OverlayFallback label="Loading analytics" />}>
          <LazyBoardAnalyticsDialog onClose={closePanel} />
        </Suspense>
      )}
      {panel === "members" && (
        <Suspense fallback={<OverlayFallback label="Loading members" />}>
          <LazyMembersDialog onClose={closePanel} />
        </Suspense>
      )}
      {panel === "github" && (
        <Suspense fallback={<OverlayFallback label="Loading GitHub sync" />}>
          <LazyGitHubSyncDrawer onClose={closePanel} />
        </Suspense>
      )}
    </>
  );
}

function OverlayFallback({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-[1px]"
    >
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
