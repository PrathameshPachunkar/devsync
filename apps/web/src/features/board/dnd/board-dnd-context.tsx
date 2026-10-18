"use client";

import { neighborsOf } from "@devsync/shared";
import {
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type KeyboardCodes,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useIsClient } from "@/hooks/use-is-client";
import { accentScopeProps } from "@/lib/theme/accents";

import { useMoveCard, useMoveColumn } from "../api/use-board-mutations";
import { ColumnOverlay } from "../components/board-column";
import { TaskCardOverlay } from "../components/task-card";
import { findColumnOfCard } from "../model/normalize";
import { useBoardActions, useBoardStore, useBoardStoreApi } from "../store/board-store";
import { createAnnouncements, screenReaderInstructions } from "./announcements";
import { createKanbanCollisionDetection } from "./collision";
import { dragType } from "./drag-data";

// Enter is reserved for opening card details, so only Space picks items up.
const KEYBOARD_CODES: KeyboardCodes = {
  start: [KeyboardCode.Space],
  cancel: [KeyboardCode.Esc],
  end: [KeyboardCode.Space, KeyboardCode.Enter],
};

const dropAnimation: DropAnimation = {
  duration: 180,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }),
};

/**
 * Board drag-and-drop controller.
 *
 * Drag state lives in the board store and is read with getState() inside the
 * handlers. The handlers are stable callbacks, so DndContext never sees new
 * props during a drag. Only the two columns involved in a cross-column hover
 * re-render. A drop fires one optimistic mutation that carries neighbor ids,
 * never raw positions.
 */
export function BoardDndContext({ children }: { children: ReactNode }) {
  const store = useBoardStoreApi();
  const actions = useBoardActions();
  const { mutate: moveCard } = useMoveCard();
  const { mutate: moveColumn } = useMoveColumn();
  const isClient = useIsClient();

  const sensors = useSensors(
    // A small distance keeps plain clicks opening the card.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short press-and-hold, so swiping still scrolls the board on touch.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: KEYBOARD_CODES,
    }),
  );

  // Created once. It remembers the last target between collision passes.
  const [collision] = useState(createKanbanCollisionDetection);
  const accessibility = useMemo(
    () => ({
      announcements: createAnnouncements(() => store.getState()),
      screenReaderInstructions,
    }),
    [store],
  );

  const onDragStart = useCallback(
    ({ active }: DragStartEvent) => {
      collision.reset();
      actions.startDrag(dragType(active) === "column" ? "column" : "card", String(active.id));
    },
    [actions, collision],
  );

  const onDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      const state = store.getState();
      if (!over || state.activeDrag?.kind !== "card") return;

      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;

      const fromColumnId = findColumnOfCard(state, activeId);
      const overIsColumn = dragType(over) === "column";
      const toColumnId = overIsColumn ? overId : findColumnOfCard(state, overId);
      // Same-column moves are animated by the sortable strategy and
      // committed on drop. Only cross-column hovers touch the store.
      if (!fromColumnId || !toColumnId || fromColumnId === toColumnId) return;

      const targetIds = state.columns[toColumnId]?.cardIds ?? [];
      let index = targetIds.length;
      if (!overIsColumn) {
        const overIndex = targetIds.indexOf(overId);
        const dragged = active.rect.current.translated;
        const isBelow = dragged !== null && dragged.top > over.rect.top + over.rect.height / 2;
        index = overIndex + (isBelow ? 1 : 0);
      }
      actions.previewCardMove(activeId, toColumnId, index);
      collision.holdAfterColumnChange();
    },
    [actions, collision, store],
  );

  const onDragEnd = useCallback(
    ({ over }: DragEndEvent) => {
      const state = store.getState();
      const drag = state.activeDrag;
      if (!drag) return;
      if (!over) return actions.endDrag(false);

      const overId = String(over.id);

      if (drag.kind === "column") {
        const overColumnId = dragType(over) === "card" ? findColumnOfCard(state, overId) : overId;
        const from = state.columnOrder.indexOf(drag.id);
        const to = overColumnId ? state.columnOrder.indexOf(overColumnId) : -1;
        if (to === -1 || from === to) return actions.endDrag(false);

        const order = arrayMove([...state.columnOrder], from, to);
        actions.setColumnOrder(order);
        actions.endDrag(true);
        const { prevId, nextId } = neighborsOf(order, drag.id);
        moveColumn(
          { boardId: state.boardId, columnId: drag.id, prevColumnId: prevId, nextColumnId: nextId },
          { onError: actions.resync },
        );
        return;
      }

      const columnId = findColumnOfCard(state, drag.id);
      const ids = columnId ? state.columns[columnId]?.cardIds : undefined;
      if (!columnId || !ids) return actions.endDrag(false);

      let finalIds = ids;
      if (dragType(over) === "card" && overId !== drag.id) {
        const from = ids.indexOf(drag.id);
        const to = ids.indexOf(overId);
        if (to !== -1 && to !== from) finalIds = arrayMove([...ids], from, to);
      }

      const unchanged =
        columnId === drag.originColumnId && finalIds.indexOf(drag.id) === drag.originIndex;
      if (unchanged) return actions.endDrag(false);

      if (finalIds !== ids) actions.setCardOrder(columnId, finalIds);
      actions.endDrag(true);
      const { prevId, nextId } = neighborsOf(finalIds, drag.id);
      moveCard(
        {
          boardId: state.boardId,
          cardId: drag.id,
          toColumnId: columnId,
          prevCardId: prevId,
          nextCardId: nextId,
        },
        { onError: actions.resync },
      );
    },
    [actions, moveCard, moveColumn, store],
  );

  const onDragCancel = useCallback(() => actions.endDrag(false), [actions]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision.detect}
      accessibility={accessibility}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
      {isClient && createPortal(<BoardDragOverlay />, document.body)}
    </DndContext>
  );
}

/**
 * Portaled to <body> so it is never clipped by scroll containers. It
 * re-applies the board accent because portals leave the board's subtree.
 */
function BoardDragOverlay() {
  const activeDrag = useBoardStore((state) => state.activeDrag);
  const accent = useBoardStore((state) => state.accent);

  return (
    <DragOverlay dropAnimation={dropAnimation} zIndex={60}>
      {activeDrag ? (
        <div {...(accent ? accentScopeProps(accent) : {})}>
          {activeDrag.kind === "card" ? (
            <TaskCardOverlay cardId={activeDrag.id} />
          ) : (
            <ColumnOverlay columnId={activeDrag.id} />
          )}
        </div>
      ) : null}
    </DragOverlay>
  );
}
