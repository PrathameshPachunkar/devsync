import { cn } from "@/lib/utils";

/** Brand mark: three Kanban lanes of different heights. Inherits the active accent. */
export function DevSyncMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
        <rect x="1.5" y="2" width="3.5" height="12" rx="1" />
        <rect x="6.25" y="2" width="3.5" height="8" rx="1" opacity="0.8" />
        <rect x="11" y="2" width="3.5" height="5" rx="1" opacity="0.6" />
      </svg>
    </span>
  );
}
