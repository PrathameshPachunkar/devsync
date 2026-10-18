import type { Active, Over } from "@dnd-kit/core";

export type DragData = { type: "card"; columnId: string } | { type: "column" };

export function dragType(entity: Active | Over | null | undefined): DragData["type"] | undefined {
  const data = entity?.data.current as DragData | undefined;
  return data?.type;
}
