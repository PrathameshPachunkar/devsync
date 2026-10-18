"use client";

import type { BoardDto, BoardRole } from "@devsync/shared";
import { createContext, use, useLayoutEffect, useState, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";

import { parseAccentSetting, type AccentSetting } from "@/lib/theme/accents";

import { findColumnOfCard, normalizeBoard, type BoardView } from "../model/normalize";

export type DragKind = "card" | "column";

export interface ActiveDrag {
  readonly kind: DragKind;
  readonly id: string;
  /** Where the item started, to detect drops that change nothing. */
  readonly originColumnId: string | null;
  readonly originIndex: number;
}

export type BoardPanel = "analytics" | "github" | "members" | null;

export interface BoardActions {
  /** Feed the latest cached server state. Deferred while a drag is active. */
  sync(board: BoardDto): void;
  /** Rebuild the view from the last synced board, e.g. after a failed write. */
  resync(): void;
  startDrag(kind: DragKind, id: string): void;
  /** Live cross-column preview while dragging a card. */
  previewCardMove(cardId: string, toColumnId: string, toIndex: number): void;
  setCardOrder(columnId: string, cardIds: readonly string[]): void;
  setColumnOrder(columnOrder: readonly string[]): void;
  /**
   * committed: a mutation was fired and the optimistic cache write will
   * re-sync the view. Otherwise the view is rebuilt from the latest board.
   */
  endDrag(committed: boolean): void;
  openCard(cardId: string | null): void;
  setPanel(panel: BoardPanel): void;
  /** Close transient UI when the route is hidden by <Activity>. */
  resetTransientUi(): void;
}

export interface BoardStoreState extends BoardView {
  readonly boardId: string;
  readonly name: string;
  /** "owner/name" of the linked repository, if any. */
  readonly repoLabel: string | null;
  /** Cards with GitHub data come from a real repo and are edited on GitHub. */
  readonly githubManaged: boolean;
  readonly role: BoardRole;
  readonly accent: AccentSetting | null;
  readonly activeDrag: ActiveDrag | null;
  readonly openCardId: string | null;
  readonly panel: BoardPanel;
  readonly actions: BoardActions;
}

function boardMeta(board: BoardDto) {
  return {
    boardId: board.id,
    name: board.name,
    repoLabel: board.repo ? `${board.repo.owner}/${board.repo.name}` : null,
    githubManaged: board.repo !== null && !board.repo.demo,
    role: board.role,
    accent: parseAccentSetting(board.accent),
  };
}

export function createBoardStore(initial: BoardDto): StoreApi<BoardStoreState> {
  // Last board synced from the query cache. Not reactive.
  let latest = initial;

  return createStore<BoardStoreState>()((set, get) => {
    const applyBoard = (board: BoardDto) => {
      const state = get();
      const view = normalizeBoard(board, state);
      const meta = boardMeta(board);
      set({
        ...view,
        name: meta.name,
        repoLabel: meta.repoLabel,
        githubManaged: meta.githubManaged,
        role: meta.role,
        // Keep the accent object stable unless it actually changed.
        accent:
          JSON.stringify(meta.accent) === JSON.stringify(state.accent) ? state.accent : meta.accent,
      });
    };

    const actions: BoardActions = {
      sync(board) {
        latest = board;
        // Never yank items out from under the pointer. endDrag catches up.
        if (!get().activeDrag) applyBoard(board);
      },
      resync() {
        if (!get().activeDrag) applyBoard(latest);
      },
      startDrag(kind, id) {
        const state = get();
        const originColumnId = kind === "card" ? (findColumnOfCard(state, id) ?? null) : null;
        const originIndex =
          kind === "card"
            ? (state.columns[originColumnId ?? ""]?.cardIds.indexOf(id) ?? -1)
            : state.columnOrder.indexOf(id);
        set({ activeDrag: { kind, id, originColumnId, originIndex } });
      },
      previewCardMove(cardId, toColumnId, toIndex) {
        const state = get();
        const fromColumnId = findColumnOfCard(state, cardId);
        const from = fromColumnId ? state.columns[fromColumnId] : undefined;
        const to = state.columns[toColumnId];
        if (!from || !to) return;

        const fromIds = from.cardIds.filter((id) => id !== cardId);
        const baseIds = from === to ? fromIds : to.cardIds;
        const index = Math.max(0, Math.min(toIndex, baseIds.length));
        const toIds = [...baseIds.slice(0, index), cardId, ...baseIds.slice(index)];

        set({
          columns: {
            ...state.columns,
            [from.id]: { ...from, cardIds: from === to ? toIds : fromIds },
            ...(from === to ? {} : { [to.id]: { ...to, cardIds: toIds } }),
          },
        });
      },
      setCardOrder(columnId, cardIds) {
        const state = get();
        const column = state.columns[columnId];
        if (!column) return;
        set({ columns: { ...state.columns, [columnId]: { ...column, cardIds } } });
      },
      setColumnOrder(columnOrder) {
        set({ columnOrder });
      },
      endDrag(committed) {
        set({ activeDrag: null });
        // A committed drop is followed by an optimistic cache write built on
        // the latest cache, so syncing here would only flash the old order.
        if (!committed) applyBoard(latest);
      },
      openCard(cardId) {
        set({ openCardId: cardId });
      },
      setPanel(panel) {
        set({ panel });
      },
      resetTransientUi() {
        if (get().activeDrag) actions.endDrag(false);
        set({ openCardId: null, panel: null });
      },
    };

    const meta = boardMeta(initial);
    return {
      ...normalizeBoard(initial),
      ...meta,
      activeDrag: null,
      openCardId: null,
      panel: null,
      actions,
    };
  });
}

const BoardStoreContext = createContext<StoreApi<BoardStoreState> | null>(null);

export function BoardStoreProvider({ board, children }: { board: BoardDto; children: ReactNode }) {
  const [store] = useState(() => createBoardStore(board));

  // Layout effect: the cache-to-view sync lands before paint.
  useLayoutEffect(() => {
    store.getState().actions.sync(board);
  }, [store, board]);

  // <Activity> hides this route on navigation instead of unmounting it.
  // Close dialogs, panels, and any drag so the board comes back clean.
  useLayoutEffect(() => () => store.getState().actions.resetTransientUi(), [store]);

  return <BoardStoreContext value={store}>{children}</BoardStoreContext>;
}

export function useBoardStoreApi(): StoreApi<BoardStoreState> {
  const store = use(BoardStoreContext);
  if (!store) throw new Error("useBoardStore must be used inside <BoardStoreProvider>");
  return store;
}

export function useBoardStore<T>(selector: (state: BoardStoreState) => T): T {
  return useStore(useBoardStoreApi(), selector);
}

/** Stable action object. Never causes a re-render. */
export function useBoardActions(): BoardActions {
  return useBoardStore((state) => state.actions);
}
