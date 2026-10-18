import {
  DEMO_TEAM,
  demoBoardTemplate,
  demoBoardTemplates,
  positionsBetween,
  type BoardDto,
  type CardDto,
} from "@devsync/shared";

/**
 * Test fixtures: the shared demo templates (the same content the API clones
 * for "Try the demo") as BoardDtos with stable, readable ids.
 */

const TEAM_BY_KEY = new Map(
  DEMO_TEAM.map((m) => [m.key, { id: `u-${m.key}`, name: m.name, avatarUrl: null }]),
);

export const DEMO_BOARD_IDS = demoBoardTemplates().map((t) => t.key);

export function seedBoard(boardId: string): BoardDto | null {
  const template = demoBoardTemplate(boardId);
  if (!template) return null;

  const columnPositions = positionsBetween(null, null, template.columns.length);
  const columns = template.columns.map((column, index) => ({
    id: `${boardId}-col-${index}`,
    boardId,
    name: column.name,
    position: columnPositions[index]!,
    wipLimit: column.wipLimit,
  }));

  const counts = template.columns.map(
    (_, i) => template.cards.filter((c) => c.columnIndex === i).length,
  );
  const positions = counts.map((n) => positionsBetween(null, null, n));
  const used = counts.map(() => 0);

  const cards: CardDto[] = template.cards.map((card, n) => ({
    id: `${boardId}-card-${n}`,
    boardId,
    columnId: columns[card.columnIndex]!.id,
    position: positions[card.columnIndex]![used[card.columnIndex]!++]!,
    title: card.title,
    description: card.description,
    labels: card.labels.map((l) => ({ id: `${boardId}-label-${l.name}`, ...l })),
    assignees: card.assignees.flatMap((key) => TEAM_BY_KEY.get(key) ?? []),
    commentCount: card.commentCount,
    dueDate: card.dueDate,
    github: card.github,
    createdAt: card.createdAt,
    updatedAt: card.createdAt,
  }));

  return {
    id: boardId,
    name: template.name,
    description: template.description,
    accent: template.accent,
    repo: template.repo,
    role: template.role,
    version: 1,
    columns,
    cards,
  };
}
