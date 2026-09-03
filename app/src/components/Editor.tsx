import { useEffect, useRef, useState } from "react";
import { encodeSave, saltFor, type DecodedSave, type SaveDocument } from "../codec/save";
import type { Catalog, CatalogItem } from "../model/catalog";
import {
  BAG_COLUMNS,
  BAG_ROWS,
  type Footprint,
  inBounds,
  itemsUnder,
  layoutBag,
  moveInBag,
  normalizeBag,
  placeInBag,
  readInventory,
  removeEquipment,
  removeFromBag,
  sortBag,
  swapInBag,
  updateBagSlot,
  updateEquipment,
  writeInventory,
} from "../model/inventory";
import { catalogItemFor, displayName, isEmptyRecord, newRecord, type ItemRecord } from "../model/records";
import { CharacterPanel } from "./CharacterPanel";
import { DangerZone } from "./DangerZone";
import { DownloadPanel } from "./DownloadPanel";
import { InventoryGrid } from "./InventoryGrid";
import { ItemDetails } from "./ItemDetails";
import { ItemPicker } from "./ItemPicker";
import { ItemSprite } from "./ItemSprite";
import { ItemTooltip, type TooltipState } from "./ItemTooltip";
import { SelectionBar } from "./SelectionBar";
import type { Comparison } from "./ItemDetails";
import { compareStats } from "../model/stats";
import { EQUIPMENT_SLOTS } from "../model/inventory";
import { SkillsPanel } from "./SkillsPanel";
import type { SkillCatalog } from "../model/skills";
import { writeSaveInPlace, type SaveEntry } from "../files/folder";
import { equipFromBag, equipNew, moveEquipment, occupantOf, slotsFor, unequipToBag } from "../model/equipment";
import type { DragPayload, Selection } from "./dragData";
import { useDragAndDrop } from "./useDragAndDrop";

interface Props {
  catalog: Catalog;
  skills: SkillCatalog;
  characterFolder: string;
  save: SaveEntry;
  original: DecodedSave;
  warning: string | null;
  onBack: () => void;
  onReload: () => void;
}

export function Editor({ catalog, skills, characterFolder, save, original, warning, onBack, onReload }: Props) {
  const saveFolder = save.folder;
  const [document, setDocument] = useState<SaveDocument>(original.document);
  const [seenOriginal, setSeenOriginal] = useState(original);
  // A reload from disk (or our own save coming back) replaces the baseline without remounting the editor.
  if (original !== seenOriginal) {
    setSeenOriginal(original);
    setDocument(original.document);
  }
  const [selection, setSelection] = useState<Selection | null>(null);
  const [multi, setMulti] = useState<ReadonlySet<number>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const inventory = readInventory(document);
  const dirty = document !== original.document;
  const gridRef = useRef<HTMLDivElement>(null);
  const footprintOf = (record: ItemRecord) => catalogItemFor(record, catalog) ?? { w: 1, h: 1 };
  const [hover, setHover] = useState<{ cell: (Footprint & { x: number; y: number }) | null; slot: string | null; cellPx: number } | null>(null);
  const { drag, dragHandle, consumedByDrag } = useDragAndDrop(onDrop, (state) =>
    setHover(state ? { cell: targetCell(state), slot: slotUnder(state), cellPx: cellSize() } : null),
  );
  const layout = layoutBag(inventory.bag, footprintOf);

  /** Every edit goes through here; bag positions are re-pinned so no two items can share a cell on disk. */
  function apply(next: SaveDocument) {
    setDocument(writeInventory(next, normalizeBag(readInventory(next), footprintOf)));
    setMessage(null);
  }

  /** Plain click selects one item; shift-click toggles bag items in and out of a multi-selection. */
  function select(next: Selection | null, extend = false) {
    if (extend && next?.kind === "bag") {
      const set = new Set(multi);
      if (selection?.kind === "bag") set.add(selection.index);
      if (set.has(next.index)) set.delete(next.index);
      else set.add(next.index);
      setMulti(set);
      const last = Array.from(set).at(-1);
      setSelection(set.has(next.index) ? next : last === undefined ? null : { kind: "bag", index: last });
      return;
    }
    setMulti(new Set());
    setSelection(next);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === "Escape") select(null);
      if (!typing && (event.key === "Delete" || event.key === "Backspace") && selectedRecords.length > 0) {
        event.preventDefault();
        removeSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function removeMulti() {
    const indexes = Array.from(multi);
    if (tryInventory(() => removeFromBag(inventory, ...indexes))) select(null);
  }

  function sortInventory() {
    const rank = (record: ItemRecord) => {
      const item = catalogItemFor(record, catalog);
      return { area: (item?.w ?? 1) * (item?.h ?? 1), category: item?.category ?? "zzz", name: item?.name ?? record[0] };
    };
    if (
      tryInventory(() =>
        sortBag(inventory, footprintOf, (a, b) => {
          const ra = rank(a);
          const rb = rank(b);
          return rb.area - ra.area || ra.category.localeCompare(rb.category) || ra.name.localeCompare(rb.name);
        }),
      )
    ) {
      select(null);
    }
  }

  function tryInventory(action: () => ReturnType<typeof readInventory>): boolean {
    try {
      apply(writeInventory(document, action()));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  function addItem(item: CatalogItem, at?: { x: number; y: number }) {
    if (tryInventory(() => placeInBag(inventory, newRecord(item, catalog), footprintOf, at))) select(null);
  }

  function draggedItem(payload: DragPayload) {
    if (payload.from === "catalog") return catalog.byKey.get(payload.key);
    if (payload.from === "equipment") return catalogItemFor(inventory.equipment[payload.position], catalog);
    return catalogItemFor(inventory.bag[payload.index], catalog);
  }

  /** Equipment slot under the pointer, if any. */
  function slotUnder(point: { x: number; y: number }): string | null {
    const element = window.document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-slot]");
    return element?.dataset.slot ?? null;
  }

  /** Whether dropping the dragged thing on an equipment slot would be accepted. */
  function slotAccepts(payload: DragPayload, slot: string): boolean {
    const item = draggedItem(payload);
    if (!slotsFor(item).includes(slot)) return false;
    if (payload.from === "catalog") return occupantOf(inventory, slot) < 0;
    return true;
  }

  function dropOnSlot(payload: DragPayload, slot: string) {
    if (payload.from === "catalog") {
      const item = catalog.byKey.get(payload.key);
      if (item && tryInventory(() => equipNew(inventory, newRecord(item, catalog), slot, catalog))) select(null);
      return;
    }
    if (payload.from === "equipment") {
      if (tryInventory(() => moveEquipment(inventory, payload.position, slot, catalog))) select(null);
      return;
    }
    if (tryInventory(() => equipFromBag(inventory, payload.index, slot, catalog, footprintOf))) select(null);
  }

  function draggedFootprint(payload: DragPayload) {
    const item = draggedItem(payload);
    return { w: item?.w ?? 1, h: item?.h ?? 1 };
  }

  /** Grid cell size in pixels, from the rendered bag. */
  function cellSize(): number {
    const rect = gridRef.current?.getBoundingClientRect();
    return rect ? rect.width / BAG_COLUMNS : 48;
  }

  /** The cell a dragged item's top-left corner would land on for a pointer position, or null when off the grid. */
  function targetCell(state: { payload: DragPayload; x: number; y: number; grab: { x: number; y: number } }) {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const size = cellSize();
    const footprint = draggedFootprint(state.payload);
    const grabCells = state.payload.from === "bag"
      ? { x: Math.floor(state.grab.x / size), y: Math.floor(state.grab.y / size) }
      : { x: Math.floor((footprint.w - 1) / 2), y: Math.floor((footprint.h - 1) / 2) };
    if (state.payload.from === "equipment") return centeredCell(state, size, footprint);
    const pointerCell = { x: Math.floor((state.x - rect.left) / size), y: Math.floor((state.y - rect.top) / size) };
    if (pointerCell.x < 0 || pointerCell.y < 0 || pointerCell.x >= BAG_COLUMNS || pointerCell.y >= BAG_ROWS) return null;
    return { x: pointerCell.x - grabCells.x, y: pointerCell.y - grabCells.y, ...footprint };
  }

  function centeredCell(state: { x: number; y: number }, size: number, footprint: Footprint) {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const pointerCell = { x: Math.floor((state.x - rect.left) / size), y: Math.floor((state.y - rect.top) / size) };
    if (pointerCell.x < 0 || pointerCell.y < 0 || pointerCell.x >= BAG_COLUMNS || pointerCell.y >= BAG_ROWS) return null;
    return { x: pointerCell.x - Math.floor((footprint.w - 1) / 2), y: pointerCell.y - Math.floor((footprint.h - 1) / 2), ...footprint };
  }

  /** What a drop would do at a cell: a free move, a swap with exactly one item, or nothing. */
  function dropPlan(payload: DragPayload, cell: { x: number; y: number; w: number; h: number }) {
    if (!inBounds(cell.x, cell.y, cell)) return { kind: "blocked" as const };
    const ignore = payload.from === "bag" ? [payload.index] : [];
    const under = itemsUnder(layout, cell.x, cell.y, cell, ignore);
    if (under.length === 0) return { kind: "place" as const };
    if (payload.from === "equipment") return { kind: "blocked" as const };
    if (payload.from === "bag" && under.length === 1) return { kind: "swap" as const, other: under[0] };
    return { kind: "blocked" as const };
  }

  const overSlot = drag && hover?.slot ? { slot: hover.slot, valid: slotAccepts(drag.payload, hover.slot) } : null;
  const fitSlots = drag
    ? slotsFor(draggedItem(drag.payload))
    : selection?.kind === "bag" && !isEmptyRecord(inventory.bag[selection.index])
      ? slotsFor(catalogItemFor(inventory.bag[selection.index], catalog))
      : [];
  const preview =
    drag && hover?.cell && !hover.slot
      ? {
          ...hover.cell,
          // Keep the highlight inside the grid even when the item would hang off the edge.
          x: Math.max(0, Math.min(hover.cell.x, BAG_COLUMNS - hover.cell.w)),
          y: Math.max(0, Math.min(hover.cell.y, BAG_ROWS - hover.cell.h)),
          valid: dropPlan(drag.payload, hover.cell).kind !== "blocked",
        }
      : null;

  function onDrop(payload: DragPayload, point: { x: number; y: number }) {
    if (!drag) return;
    const slot = slotUnder(point);
    if (slot) {
      dropOnSlot(payload, slot);
      return;
    }
    const cell = targetCell({ payload, x: point.x, y: point.y, grab: drag.grab });
    if (!cell) return;
    if (payload.from === "equipment") {
      const plan = dropPlan(payload, cell);
      if (plan.kind !== "place") {
        setMessage("There is no room for that item there.");
        return;
      }
      if (tryInventory(() => unequipToBag(inventory, payload.position, footprintOf, cell))) select(null);
      return;
    }
    const plan = dropPlan(payload, cell);
    if (plan.kind === "blocked") {
      if (!inBounds(cell.x, cell.y, cell)) setMessage("That item does not fit inside the bag there.");
      else if (payload.from === "bag") setMessage("That would overlap other items. Drop onto exactly one item to swap.");
      else setMessage("There is no room for that item there.");
      return;
    }
    if (payload.from === "catalog") {
      const item = catalog.byKey.get(payload.key);
      if (item) addItem(item, cell);
      return;
    }
    if (plan.kind === "swap") {
      if (tryInventory(() => swapInBag(inventory, payload.index, plan.other, footprintOf))) select({ kind: "bag", index: payload.index });
      return;
    }
    if (tryInventory(() => moveInBag(inventory, payload.index, cell.x, cell.y, footprintOf))) select({ kind: "bag", index: payload.index });
  }

  /** Ghost drawn at the item's real grid size, held where it was grabbed. */
  function ghostStyle(state: NonNullable<typeof drag>) {
    const size = hover?.cellPx ?? 48;
    const footprint = draggedFootprint(state.payload);
    const width = footprint.w * size;
    const height = footprint.h * size;
    const left = state.payload.from === "bag" ? state.x - state.grab.x : state.x - width / 2;
    const top = state.payload.from === "bag" ? state.y - state.grab.y : state.y - height / 2;
    return { left, top, width, height };
  }

  const selected: ItemRecord | null =
    selection?.kind === "bag" && !isEmptyRecord(inventory.bag[selection.index])
      ? inventory.bag[selection.index]
      : selection?.kind === "equipment" && inventory.equipment[selection.position]
        ? inventory.equipment[selection.position]
        : null;

  /** How a loose item compares with whatever sits in each slot it could go in. */
  function comparisonsFor(record: ItemRecord): Comparison[] {
    if (record[9] !== "N/A") return [];
    return slotsFor(catalogItemFor(record, catalog))
      .map((slot) => {
        const position = occupantOf(inventory, slot);
        const current = position >= 0 ? inventory.equipment[position] : null;
        return {
          slotLabel: EQUIPMENT_SLOTS.find((entry) => entry.slot === slot)?.label ?? slot,
          currentName: current ? displayName(current, catalog) : null,
          rows: compareStats(record, current),
        };
      })
      // Two empty ring slots would show the same table twice.
      .filter((entry, index, all) => all.findIndex((other) => other.currentName === entry.currentName) === index);
  }

  const comparisons: Comparison[] = selected && selection?.kind === "bag" ? comparisonsFor(selected) : [];

  /** Everything the selection actions apply to: the shift-click set, or the single selected item. */
  const selectedRecords: ItemRecord[] =
    multi.size > 0
      ? Array.from(multi).map((index) => inventory.bag[index])
      : selected
        ? [selected]
        : [];

  function removeSelection() {
    if (multi.size > 0) {
      removeMulti();
      return;
    }
    removeSelected();
  }

  function updateSelected(update: (record: ItemRecord) => void) {
    if (!selection) return;
    tryInventory(() =>
      selection.kind === "bag" ? updateBagSlot(inventory, selection.index, update) : updateEquipment(inventory, selection.position, update),
    );
  }

  function duplicateSelected() {
    if (!selected) return;
    tryInventory(() => placeInBag(inventory, selected, footprintOf));
  }

  function removeSelected() {
    if (!selection) return;
    tryInventory(() => (selection.kind === "bag" ? removeFromBag(inventory, selection.index) : removeEquipment(inventory, selection.position)));
    select(null);
  }

  async function saveInPlace() {
    try {
      const bytes = await encodeSave(document, saltFor(characterFolder, saveFolder));
      const { backedUp } = await writeSaveInPlace(save, bytes, save.file.lastModified);
      setMessage(
        (backedUp ? "Saved. Your untouched original was kept as data.sav.original in the same folder. " : "Saved. ") +
          "Start the game and load the save. Press “Reload from disk” here after the game writes to it.",
      );
      onReload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function download() {
    try {
      const bytes = await encodeSave(document, saltFor(characterFolder, saveFolder));
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = "data.sav";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Downloaded. Follow the steps under “How do I use the downloaded file?” to put it in place.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="editor">
      <DownloadPanel
        characterFolder={characterFolder}
        saveFolder={saveFolder}
        dirty={dirty}
        inPlace={Boolean(save.handle)}
        onDownload={download}
        onSaveInPlace={saveInPlace}
        onReload={onReload}
        onReset={() => {
          setDocument(original.document);
          setMessage(null);
          select(null);
        }}
        onBack={onBack}
      />
      {warning && <p className="warning">{warning}</p>}
      {message && <p className="notice">{message}</p>}
      <div className="columns">
        <div className="column">
          <CharacterPanel document={document} catalog={catalog} onChange={apply} onError={setMessage} />
          {multi.size === 0 && selected && (
            <ItemDetails
              record={selected}
              catalog={catalog}
              equipped={selection?.kind === "equipment"}
              comparisons={comparisons}
              onUpdate={updateSelected}
              onDuplicate={duplicateSelected}
              onRemove={removeSelected}
            />
          )}
        </div>
        <div className="column wide">
          <InventoryGrid
            inventory={inventory}
            catalog={catalog}
            selection={selection}
            gridRef={gridRef}
            preview={preview}
            overSlot={overSlot}
            fitSlots={fitSlots}
            dragHandle={dragHandle}
            consumedByDrag={consumedByDrag}
            multiSelected={multi}
            onSelect={select}
            onSort={sortInventory}
            onHover={(record, x, y) => setTooltip(record ? { record, x, y } : null)}
          />
        </div>
        <div className="column picker-column">
          <ItemPicker catalog={catalog} showHidden={showHidden} dragHandle={dragHandle} onAdd={(item) => addItem(item)} />
        </div>
      </div>
      <SkillsPanel document={document} skills={skills} onChange={apply} />
      <DangerZone document={document} showHidden={showHidden} onShowHidden={setShowHidden} onChange={apply} />
      <SelectionBar
        catalog={catalog}
        records={selectedRecords}
        canDuplicate={multi.size === 0 && selected !== null}
        onDuplicate={duplicateSelected}
        onRemove={removeSelection}
        onClear={() => select(null)}
      />
      {tooltip && !drag && <ItemTooltip state={tooltip} catalog={catalog} comparisons={comparisonsFor(tooltip.record)} />}
      {drag && (
        <div className="drag-ghost" style={ghostStyle(drag)}>
          <ItemSprite item={draggedItem(drag.payload)} fallback="…" />
        </div>
      )}
    </div>
  );
}
