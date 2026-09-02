import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DragPayload } from "./dragData";

/**
 * Pointer-based drag and drop. Native HTML5 dragging misbehaves on buttons in several browsers,
 * so tiles start a drag on pointer movement and the drop point is handed back on release.
 */

export interface DragState {
  payload: DragPayload;
  /** Current pointer position. */
  x: number;
  y: number;
  /** Where inside the dragged element the pointer grabbed it, in pixels. */
  grab: { x: number; y: number };
  /** Size of the element the drag started from. */
  origin: { width: number; height: number };
}

const DRAG_THRESHOLD_PX = 5;

export function useDragAndDrop(
  onDrop: (payload: DragPayload, point: { x: number; y: number }) => void,
  onMove?: (state: DragState | null) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const moveHandler = useRef(onMove);
  const pending = useRef<Omit<DragState, "x" | "y"> & { startX: number; startY: number } | null>(null);
  const active = useRef<DragState | null>(null);
  const justDropped = useRef(false);
  const dropHandler = useRef(onDrop);
  useEffect(() => {
    dropHandler.current = onDrop;
    moveHandler.current = onMove;
  });

  useEffect(() => {
    function update(next: DragState | null) {
      active.current = next;
      setDrag(next);
      moveHandler.current?.(next);
      document.body.classList.toggle("dragging", next !== null);
    }

    function onMove(event: PointerEvent) {
      if (active.current) {
        update({ ...active.current, x: event.clientX, y: event.clientY });
        return;
      }
      const start = pending.current;
      if (!start) return;
      if (Math.hypot(event.clientX - start.startX, event.clientY - start.startY) < DRAG_THRESHOLD_PX) return;
      update({ payload: start.payload, grab: start.grab, origin: start.origin, x: event.clientX, y: event.clientY });
    }

    function onUp(event: PointerEvent) {
      pending.current = null;
      const current = active.current;
      if (!current) return;
      update(null);
      dropHandler.current(current.payload, { x: event.clientX, y: event.clientY });
      justDropped.current = true;
      setTimeout(() => (justDropped.current = false), 0);
    }

    function onCancel() {
      pending.current = null;
      if (active.current) update(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.body.classList.remove("dragging");
    };
  }, []);

  /** Spread onto any element that should start a drag. */
  function dragHandle(payload: DragPayload) {
    return {
      onPointerDown: (event: ReactPointerEvent) => {
        if (event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        pending.current = {
          payload,
          startX: event.clientX,
          startY: event.clientY,
          grab: { x: event.clientX - rect.left, y: event.clientY - rect.top },
          origin: { width: rect.width, height: rect.height },
        };
      },
    };
  }

  /** True right after a drop, so the click that follows a drag does not also select. */
  function consumedByDrag(): boolean {
    return justDropped.current;
  }

  return { drag, dragHandle, consumedByDrag };
}
