import {
  closestCenter,
  closestCorners,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DroppableContainer,
  type UniqueIdentifier,
} from "@dnd-kit/core";

import type { DragData } from "./drag-data";

const typeOf = (container: DroppableContainer | undefined) =>
  (container?.data.current as DragData | undefined)?.type;

/**
 * Multi-container collision strategy for a Kanban board.
 *
 * - Columns only collide with columns, nearest center wins.
 * - Cards prefer the card under the pointer. Over a column's empty area they
 *   snap to that column's nearest card, or to the column itself when it is
 *   empty, which is what makes empty columns valid drop targets.
 * - Keyboard drags have no pointer and use nearest corners instead.
 * - Remembering the last target avoids flicker when layout shifts leave the
 *   pointer briefly over nothing.
 * - After a card jumps to another column its droppable rects are stale
 *   until re-measured. Without a pause, the next pass can match the old
 *   column, move the card back, and loop until React aborts with
 *   "Maximum update depth exceeded". So the target is held for two frames.
 */
export interface KanbanCollisionDetection {
  detect: CollisionDetection;
  /** Forget the remembered target. Call at drag start. */
  reset: () => void;
  /** Call right after previewing a move into another column. */
  holdAfterColumnChange: () => void;
}

export function createKanbanCollisionDetection(): KanbanCollisionDetection {
  const lastOverId: { current: UniqueIdentifier | null } = { current: null };
  let holding = false;
  let frame = 0;
  const detect: CollisionDetection = (args) => {
    const containers = args.droppableContainers;

    if ((args.active.data.current as DragData | undefined)?.type === "column") {
      return closestCenter({
        ...args,
        droppableContainers: containers.filter((c) => typeOf(c) === "column"),
      });
    }

    if (holding && lastOverId.current !== null) return [{ id: lastOverId.current }];

    // Keyboard drags have no pointer. sortableKeyboardCoordinates moves the
    // collision rect exactly onto the next card or empty column, so the
    // nearest corners identify the target. Rect intersection would keep
    // matching the dragged card's own slot.
    if (!args.pointerCoordinates) {
      const [nearest] = closestCorners(args);
      if (nearest) lastOverId.current = nearest.id;
      return nearest ? [nearest] : [];
    }

    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
    const byId = new Map(containers.map((c) => [c.id, c]));

    const cardHit = hits.find((hit) => typeOf(byId.get(hit.id)) === "card");
    if (cardHit) {
      lastOverId.current = cardHit.id;
      return [cardHit];
    }

    const columnHit = hits.find((hit) => typeOf(byId.get(hit.id)) === "column");
    if (columnHit) {
      const cardsInColumn = containers.filter(
        (c) =>
          typeOf(c) === "card" &&
          (c.data.current as Extract<DragData, { type: "card" }>).columnId === columnHit.id,
      );
      const nearest =
        cardsInColumn.length > 0
          ? closestCenter({ ...args, droppableContainers: cardsInColumn })[0]
          : undefined;
      const target = nearest ?? columnHit;
      lastOverId.current = target.id;
      return [target];
    }

    return lastOverId.current === null ? [] : [{ id: lastOverId.current }];
  };
  return {
    detect,
    reset: () => {
      lastOverId.current = null;
      holding = false;
    },
    holdAfterColumnChange: () => {
      holding = true;
      cancelAnimationFrame(frame);
      // Frame 1: React commits and dnd-kit re-measures. Frame 2: rects are fresh.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          holding = false;
        });
      });
    },
  };
}
