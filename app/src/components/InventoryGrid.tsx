import type { RefObject } from "react";
import type { Catalog } from "../model/catalog";
import { BAG_COLUMNS, BAG_ROWS, EQUIPMENT_SLOTS, equippedIn, layoutBag, type Footprint, type Inventory } from "../model/inventory";
import { catalogItemFor, displayName, stackOf, type ItemRecord } from "../model/records";
import { ItemSprite } from "./ItemSprite";
import type { DragPayload, Selection } from "./dragData";

interface Props {
  inventory: Inventory;
  catalog: Catalog;
  selection: Selection | null;
  gridRef: RefObject<HTMLDivElement | null>;
  /** Footprint of the item being dragged, at the cell it would land on. */
  preview: (Footprint & { x: number; y: number; valid: boolean }) | null;
  /** Equipment slot under the pointer while dragging, and whether the drop would be accepted. */
  overSlot: { slot: string; valid: boolean } | null;
  /** Slots the selected or dragged item could be equipped in. */
  fitSlots: readonly string[];
  dragHandle: (payload: DragPayload) => { onPointerDown: (event: React.PointerEvent) => void };
  consumedByDrag: () => boolean;
  /** Bag indexes in the multi-selection (shift-click). */
  multiSelected: ReadonlySet<number>;
  onSelect: (selection: Selection | null, extend?: boolean) => void;
  onSort: () => void;
  onHover: (record: ItemRecord | null, x: number, y: number) => void;
}

export function InventoryGrid({ inventory, catalog, selection, gridRef, preview, overSlot, fitSlots, dragHandle, consumedByDrag, multiSelected, onSelect, onSort, onHover }: Props) {
  const hoverHandlers = (record: ItemRecord) => ({
    onPointerEnter: (event: React.PointerEvent) => onHover(record, event.clientX, event.clientY),
    onPointerMove: (event: React.PointerEvent) => onHover(record, event.clientX, event.clientY),
    onPointerLeave: () => onHover(null, 0, 0),
  });
  const { placements, overflow } = layoutBag(inventory.bag, (record) => catalogItemFor(record, catalog) ?? { w: 1, h: 1 });
  const cells = Array.from({ length: BAG_COLUMNS * BAG_ROWS }, (_, cell) => ({ x: cell % BAG_COLUMNS, y: Math.floor(cell / BAG_COLUMNS) }));

  return (
    <section className="panel inventory">
      <h2>Equipment</h2>
      <div className="bag paperdoll" style={{ gridTemplateColumns: `repeat(${BAG_COLUMNS}, minmax(0, 1fr))` }}>
        {EQUIPMENT_SLOTS.map(({ slot, label, x, y, w, h }) => {
          const record = equippedIn(inventory, slot);
          const position = record ? inventory.equipment.indexOf(record) : -1;
          const selected = selection?.kind === "equipment" && selection.position === position;
          const over = overSlot?.slot === slot ? (overSlot.valid ? "over" : "over-invalid") : "";
          const fits = fitSlots.includes(slot) ? "fits" : "";
          return (
            <button
              type="button"
              key={slot}
              className={["slot", "tile", "equipment-slot", selected ? "selected" : "", over, fits].join(" ")}
              style={{ gridArea: `${y + 1} / ${x + 1} / span ${h} / span ${w}` }}
              aria-label={record ? displayName(record, catalog) : label}
              data-slot={slot}
              {...(record ? { ...dragHandle({ from: "equipment", position }), ...hoverHandlers(record) } : {})}
              onClick={() => {
                if (consumedByDrag()) return;
                onSelect(record ? { kind: "equipment", position } : null);
              }}
            >
              {record ? <RecordTile record={record} catalog={catalog} /> : <span className="slot-label">{label}</span>}
            </button>
          );
        })}
      </div>
      <SwapRow inventory={inventory} catalog={catalog} selection={selection} onSelect={onSelect} onHover={onHover} />
      <div className="bag-header">
        <h2>Bag</h2>
        <button type="button" onClick={onSort} title="Arrange the bag: biggest items first, grouped by category">
          Sort
        </button>
      </div>
      <div ref={gridRef} className="bag" style={{ gridTemplateColumns: `repeat(${BAG_COLUMNS}, minmax(0, 1fr))` }}>
        {cells.map(({ x, y }) => (
          <button
            type="button"
            key={`${x},${y}`}
            className="cell"
            style={{ gridArea: `${y + 1} / ${x + 1}` }}
            title="Empty space"
            onClick={() => onSelect(null)}
          />
        ))}
        {preview && (
          <div
            className={preview.valid ? "drop-preview valid" : "drop-preview invalid"}
            style={{ gridArea: `${preview.y + 1} / ${preview.x + 1} / span ${preview.h} / span ${preview.w}` }}
          />
        )}
        {placements.map((placement) => {
          const record = inventory.bag[placement.index];
          const selected = (selection?.kind === "bag" && selection.index === placement.index) || multiSelected.has(placement.index);
          return (
            <button
              type="button"
              key={placement.index}
              className={["slot", "tile", selected ? "selected" : ""].join(" ")}
              style={{ gridArea: `${placement.y + 1} / ${placement.x + 1} / span ${placement.h} / span ${placement.w}` }}
              aria-label={displayName(record, catalog)}
              {...dragHandle({ from: "bag", index: placement.index })}
              {...hoverHandlers(record)}
              onClick={(event) => {
                if (consumedByDrag()) return;
                onSelect({ kind: "bag", index: placement.index }, event.shiftKey);
              }}
            >
              <RecordTile record={record} catalog={catalog} />
            </button>
          );
        })}
      </div>
      {overflow.length > 0 && (
        <>
          <h3>Does not fit in the bag</h3>
          <div className="equipment">
            {overflow.map((index) => (
              <button
                type="button"
                key={index}
                className={selection?.kind === "bag" && selection.index === index ? "slot selected" : "slot"}
                aria-label={displayName(inventory.bag[index], catalog)}
                onClick={() => onSelect({ kind: "bag", index })}
              >
                <RecordTile record={inventory.bag[index]} catalog={catalog} />
              </button>
            ))}
          </div>
        </>
      )}
      <p className="hint">
        Drag items anywhere they fit; dropping onto another item swaps the two. Drag onto an equipment slot to equip, or
        drag equipment into the bag to take it off. Drag from the item list to add. Shift-click to select several.
      </p>
    </section>
  );
}

function SwapRow({ inventory, catalog, selection, onSelect, onHover }: Pick<Props, "inventory" | "catalog" | "selection" | "onSelect" | "onHover">) {
  const swapped = inventory.equipment.filter((record) => Boolean(record[8]));
  const hoverHandlers = (record: ItemRecord) => ({
    onPointerEnter: (event: React.PointerEvent) => onHover(record, event.clientX, event.clientY),
    onPointerMove: (event: React.PointerEvent) => onHover(record, event.clientX, event.clientY),
    onPointerLeave: () => onHover(null, 0, 0),
  });
  if (swapped.length === 0) return null;
  return (
    <>
      <h3>Weapon swap set</h3>
      <div className="equipment">
        {swapped.map((record) => {
          const position = inventory.equipment.indexOf(record);
          const selected = selection?.kind === "equipment" && selection.position === position;
          return (
            <button
              type="button"
              key={position}
              className={selected ? "slot equipment-slot selected" : "slot equipment-slot"}
              aria-label={displayName(record, catalog)}
              {...hoverHandlers(record)}
              onClick={() => onSelect({ kind: "equipment", position })}
            >
              <RecordTile record={record} catalog={catalog} />
            </button>
          );
        })}
      </div>
    </>
  );
}

function RecordTile({ record, catalog }: { record: ItemRecord; catalog: Catalog }) {
  const item = catalogItemFor(record, catalog);
  const stack = stackOf(record);
  return (
    <>
      <ItemSprite item={item} fallback={displayName(record, catalog).slice(0, 3)} />
      {stack !== null && stack > 1 && <span className="stack">{stack}</span>}
    </>
  );
}
