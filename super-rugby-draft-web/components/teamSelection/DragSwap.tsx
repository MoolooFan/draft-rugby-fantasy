"use client";
// components/teamSelection/DragSwap.tsx
// Team Selection: drag a player onto another to swap them (Ethan, 26 Nov 2026), as well as
// tapping Swap then the other player. Press and hold a tile (or click and drag with a mouse),
// move it onto another player's tile and let go: the same swap rules as tapping
// (components/teamSelection/helpers.ts swapPlanFor). A quick tap still opens the player card.
import React from "react";
import { DndContext, DragOverlay, MouseSensor, pointerWithin, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";

export function SwapDnd({
  activeId,
  onStart,
  onDrop,
  onCancel,
  overlay,
  children,
}: {
  /** the tile being dragged (null when none) */
  activeId: string | null;
  onStart: (slotId: string) => void;
  onDrop: (fromSlotId: string, toSlotId: string) => void;
  onCancel: () => void;
  /** what follows your finger: a copy of the dragged tile */
  overlay: (slotId: string) => React.ReactNode;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => {
        dragEndedAt.current = Date.now();
        onStart(String(e.active.id));
      }}
      onDragEnd={(e: DragEndEvent) => {
        dragEndedAt.current = Date.now();
        const to = e.over?.id;
        if (to != null && to !== e.active.id) onDrop(String(e.active.id), String(to));
        else onCancel();
      }}
      onDragCancel={() => {
        dragEndedAt.current = Date.now();
        onCancel();
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>{activeId ? <div style={{ pointerEvents: "none", transform: "scale(1.08)" }}>{overlay(activeId)}</div> : null}</DragOverlay>
    </DndContext>
  );
}

// a tap right after a drag isn't a tap (dropping a player doesn't open his card)
const dragEndedAt = { current: 0 };
export const justDraggedTile = () => Date.now() - dragEndedAt.current < 400;

/** A tile that can be dragged (when it has a player) and dropped on. */
export function DragSwapTile({ id, canDrag, children }: { id: string; canDrag: boolean; children: React.ReactNode }) {
  const drag = useDraggable({ id, disabled: !canDrag });
  const drop = useDroppable({ id });
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      // press-and-hold is for dragging, not the phone's copy / save-image menu
      onContextMenu={(e) => e.preventDefault()}
      style={{
        opacity: drag.isDragging ? 0.35 : 1,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        touchAction: "manipulation",
        display: "flex",
      }}
    >
      {children}
    </div>
  );
}
