import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from "@dnd-kit/core";

import type { BoardView } from "../model/normalize";

export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "To pick up a card or column, press Space. Use the arrow keys to move it, then press Space to drop or Escape to cancel. Press Enter on a card to open its details.",
};

/** Spoken feedback with real names and positions instead of raw ids. */
export function createAnnouncements(getView: () => BoardView): Announcements {
  const name = (id: UniqueIdentifier) => {
    const view = getView();
    const key = String(id);
    const card = view.cards[key];
    if (card) return `card "${card.title}"`;
    const column = view.columns[key];
    return column ? `column "${column.name}"` : "item";
  };

  const location = (id: UniqueIdentifier) => {
    const view = getView();
    const key = String(id);
    const column = view.columns[key];
    if (column) {
      const index = view.columnOrder.indexOf(key);
      return `column "${column.name}", position ${index + 1} of ${view.columnOrder.length}`;
    }
    for (const columnId of view.columnOrder) {
      const col = view.columns[columnId];
      const index = col?.cardIds.indexOf(key) ?? -1;
      if (col && index !== -1) {
        return `position ${index + 1} of ${col.cardIds.length} in "${col.name}"`;
      }
    }
    return "an unknown position";
  };

  return {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    // Same-column moves are only previewed visually, so describe the target
    // slot rather than the dragged item's stored position.
    onDragOver: ({ active, over }) =>
      over
        ? `${name(active.id)} is over ${over.id === active.id ? location(active.id) : location(over.id)}.`
        : `${name(active.id)} is no longer over a drop target.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${name(active.id)} at ${location(active.id)}.`
        : `Dropped ${name(active.id)}. It returned to its original position.`,
    onDragCancel: ({ active }) =>
      `Cancelled. ${name(active.id)} returned to its original position.`,
  };
}
