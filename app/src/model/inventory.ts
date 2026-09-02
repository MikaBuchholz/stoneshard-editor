import type { SaveDocument } from "../codec/save";
import { asLooseRecord, cloneRecord, emptyRecord, isEmptyRecord, isItemRecord, type ItemRecord } from "./records";

/**
 * The player's inventory as stored in `inventoryDataList`.
 *
 * Equipped items carry their slot object name in the last field and can sit anywhere in the list,
 * mixed with bag items. Bag items keep their position as compartment 0 plus a linear cell index on
 * the 5x10 grid (verified against a real save). "empty" placeholders mark removed entries. Items
 * with no usable position are packed into free cells top-left.
 */

export const BAG_COLUMNS = 10;
export const BAG_ROWS = 5;

export interface Footprint {
  w: number;
  h: number;
}

export interface Placement extends Footprint {
  index: number;
  x: number;
  y: number;
}

/** Paperdoll layout as the game draws it, in grid cells on the same 10-wide grid as the bag. */
export const EQUIPMENT_SLOTS = [
  { slot: "o_inv_right_hand", label: "Weapon", x: 0, y: 0, w: 2, h: 5 },
  { slot: "o_inv_armor", label: "Body", x: 2, y: 0, w: 2, h: 3 },
  { slot: "o_inv_back", label: "Back", x: 4, y: 0, w: 2, h: 3 },
  { slot: "o_inv_head", label: "Head", x: 6, y: 0, w: 2, h: 2 },
  { slot: "o_inv_belt", label: "Belt", x: 6, y: 2, w: 2, h: 1 },
  { slot: "o_inv_gloves", label: "Hands", x: 2, y: 3, w: 2, h: 2 },
  { slot: "o_inv_ring_1", label: "Ring", x: 4, y: 3, w: 1, h: 1 },
  { slot: "o_inv_ring_2", label: "Ring", x: 4, y: 4, w: 1, h: 1 },
  { slot: "o_inv_neck", label: "Amulet", x: 5, y: 3, w: 1, h: 2 },
  { slot: "o_inv_boots", label: "Feet", x: 6, y: 3, w: 2, h: 2 },
  { slot: "o_inv_left_hand", label: "Off-hand", x: 8, y: 0, w: 2, h: 5 },
] as const;

export interface Inventory {
  equipment: ItemRecord[];
  bag: ItemRecord[];
  /** Which list each original entry came from, so the file is written back in the same order. */
  sequence: ("equipment" | "bag")[];
}

export function readInventory(document: SaveDocument): Inventory {
  const list = document.inventoryDataList;
  if (!Array.isArray(list)) throw new Error("This save has no inventory list.");
  const records = list.filter(isItemRecord);
  const equipment = records.filter((record) => record[9] !== "N/A");
  const bag = records.filter((record) => record[9] === "N/A");
  const sequence = records.map((record): "equipment" | "bag" => (record[9] !== "N/A" ? "equipment" : "bag"));
  return { equipment, bag, sequence };
}

export function writeInventory(document: SaveDocument, inventory: Inventory): SaveDocument {
  const equipment = [...inventory.equipment];
  const bag = [...inventory.bag];
  const list: ItemRecord[] = [];
  for (const kind of inventory.sequence) {
    const next = kind === "equipment" ? equipment.shift() : bag.shift();
    if (next) list.push(next);
  }
  list.push(...equipment, ...bag);
  return { ...document, inventoryDataList: list };
}

export function equippedIn(inventory: Inventory, slot: string, swapped = false): ItemRecord | undefined {
  return inventory.equipment.find((record) => record[9] === slot && Boolean(record[8]) === swapped);
}

export interface BagLayout {
  placements: Placement[];
  /** Bag indexes that found no room on the grid. */
  overflow: number[];
  /** For each grid cell, the bag index occupying it, or null. */
  occupancy: (number | null)[];
}

export type FootprintOf = (record: ItemRecord) => Footprint;

/**
 * Where every bag item sits. A record's cell field (the same field containers use) is honored
 * when it is in bounds and free; anything else, including the 0,0 the game writes for an
 * unarranged bag, is packed into the first free spot top-left.
 */
export function layoutBag(bag: ItemRecord[], footprintOf: FootprintOf): BagLayout {
  const occupancy: (number | null)[] = new Array(BAG_COLUMNS * BAG_ROWS).fill(null);
  const placements: Placement[] = [];
  const overflow: number[] = [];
  const pending: number[] = [];
  bag.forEach((record, index) => {
    if (isEmptyRecord(record)) return;
    const { w, h } = clampFootprint(footprintOf(record));
    const cell = storedCell(record);
    const x = cell % BAG_COLUMNS;
    const y = Math.floor(cell / BAG_COLUMNS);
    if (cell > 0 && fitsAt(occupancy, x, y, w, h)) {
      occupy(occupancy, index, x, y, w, h);
      placements.push({ index, x, y, w, h });
    } else {
      pending.push(index);
    }
  });
  for (const index of pending) {
    const { w, h } = clampFootprint(footprintOf(bag[index]));
    const cell = storedCell(bag[index]);
    const spot = cell === 0 && fitsAt(occupancy, 0, 0, w, h) ? { x: 0, y: 0 } : findSpot(occupancy, w, h);
    if (!spot) {
      overflow.push(index);
      continue;
    }
    occupy(occupancy, index, spot.x, spot.y, w, h);
    placements.push({ index, x: spot.x, y: spot.y, w, h });
  }
  placements.sort((a, b) => a.index - b.index);
  return { placements, overflow, occupancy };
}

function storedCell(record: ItemRecord): number {
  return record[2] === 0 && Number.isInteger(record[3]) && record[3] >= 0 ? record[3] : 0;
}

/** Bag indexes whose items would overlap a footprint at x,y; `ignore` is left out. */
export function itemsUnder(layout: BagLayout, x: number, y: number, footprint: Footprint, ignore: number[] = []): number[] {
  const found = new Set<number>();
  for (let dy = 0; dy < footprint.h; dy++) {
    for (let dx = 0; dx < footprint.w; dx++) {
      const index = layout.occupancy[(y + dy) * BAG_COLUMNS + x + dx];
      if (index !== null && index !== undefined && !ignore.includes(index)) found.add(index);
    }
  }
  return Array.from(found);
}

export function inBounds(x: number, y: number, footprint: Footprint): boolean {
  return x >= 0 && y >= 0 && x + footprint.w <= BAG_COLUMNS && y + footprint.h <= BAG_ROWS;
}

/** Pin every bag item to the cell it currently shows at, so the file never carries overlapping positions. */
export function normalizeBag(inventory: Inventory, footprintOf: FootprintOf): Inventory {
  return { ...inventory, bag: pinLayout(inventory.bag, layoutBag(inventory.bag, footprintOf)) };
}

function pinLayout(bag: ItemRecord[], layout: BagLayout): ItemRecord[] {
  const pinned = [...bag];
  for (const placement of layout.placements) {
    const record = cloneRecord(pinned[placement.index]);
    record[2] = 0;
    record[3] = placement.y * BAG_COLUMNS + placement.x;
    pinned[placement.index] = record;
  }
  return pinned;
}

/** Add a record at a cell, or at the first free spot when no cell is given. */
export function placeInBag(inventory: Inventory, record: ItemRecord, footprintOf: FootprintOf, at?: { x: number; y: number }): Inventory {
  const layout = layoutBag(inventory.bag, footprintOf);
  const footprint = clampFootprint(footprintOf(record));
  const spot = at ?? findSpot(layout.occupancy, footprint.w, footprint.h);
  if (!spot) throw new Error("No room left in the bag for that item.");
  if (!inBounds(spot.x, spot.y, footprint) || itemsUnder(layout, spot.x, spot.y, footprint).length > 0) {
    throw new Error("That does not fit there.");
  }
  const bag = pinLayout(inventory.bag, layout);
  const placed = asLooseRecord(record);
  placed[2] = 0;
  placed[3] = spot.y * BAG_COLUMNS + spot.x;
  const slot = bag.findIndex(isEmptyRecord);
  if (slot >= 0) bag[slot] = placed;
  else bag.push(placed);
  return { ...inventory, bag };
}

/** Move a bag item to a cell where it fits without touching anything else. */
export function moveInBag(inventory: Inventory, index: number, x: number, y: number, footprintOf: FootprintOf): Inventory {
  const layout = layoutBag(inventory.bag, footprintOf);
  const footprint = clampFootprint(footprintOf(inventory.bag[index]));
  if (!inBounds(x, y, footprint)) throw new Error("That does not fit there.");
  if (itemsUnder(layout, x, y, footprint, [index]).length > 0) throw new Error("That would overlap another item.");
  const bag = pinLayout(inventory.bag, layout);
  const record = cloneRecord(bag[index]);
  record[3] = y * BAG_COLUMNS + x;
  bag[index] = record;
  return { ...inventory, bag };
}

/** Two items trade places; both must fit at each other's cell without touching anything else. */
export function swapInBag(inventory: Inventory, first: number, second: number, footprintOf: FootprintOf): Inventory {
  const layout = layoutBag(inventory.bag, footprintOf);
  const a = layout.placements.find((p) => p.index === first);
  const b = layout.placements.find((p) => p.index === second);
  if (!a || !b) throw new Error("One of those items is not on the grid.");
  const aFits = inBounds(b.x, b.y, a) && itemsUnder(layout, b.x, b.y, a, [first, second]).length === 0;
  const bFits = inBounds(a.x, a.y, b) && itemsUnder(layout, a.x, a.y, b, [first, second]).length === 0;
  if (!aFits || !bFits) throw new Error("Those two cannot trade places; they would overlap something.");
  const bag = pinLayout(inventory.bag, layout);
  const recordA = cloneRecord(bag[first]);
  const recordB = cloneRecord(bag[second]);
  recordA[3] = b.y * BAG_COLUMNS + b.x;
  recordB[3] = a.y * BAG_COLUMNS + a.x;
  bag[first] = recordA;
  bag[second] = recordB;
  return { ...inventory, bag };
}

export function removeFromBag(inventory: Inventory, ...indexes: number[]): Inventory {
  const bag = [...inventory.bag];
  for (const index of indexes) bag[index] = emptyRecord();
  return { ...inventory, bag };
}

/** Re-pack the bag top-left in the given order, dropping placeholders. `compare` decides the order. */
export function sortBag(inventory: Inventory, footprintOf: FootprintOf, compare: (a: ItemRecord, b: ItemRecord) => number): Inventory {
  const items = inventory.bag.filter((record) => !isEmptyRecord(record)).map((record) => {
    const copy = cloneRecord(record);
    copy[2] = 0;
    copy[3] = 0;
    return copy;
  });
  items.sort(compare);
  return { ...inventory, bag: pinLayout(items, layoutBag(items, footprintOf)) };
}

export function updateBagSlot(inventory: Inventory, index: number, update: (record: ItemRecord) => void): Inventory {
  const bag = [...inventory.bag];
  const record = cloneRecord(bag[index]);
  update(record);
  bag[index] = record;
  return { ...inventory, bag };
}

export function removeEquipment(inventory: Inventory, position: number): Inventory {
  return { ...inventory, equipment: inventory.equipment.filter((_, index) => index !== position) };
}

export function updateEquipment(inventory: Inventory, position: number, update: (record: ItemRecord) => void): Inventory {
  const equipment = [...inventory.equipment];
  const record = cloneRecord(equipment[position]);
  update(record);
  equipment[position] = record;
  return { ...inventory, equipment };
}

function clampFootprint({ w, h }: Footprint): Footprint {
  return { w: Math.min(BAG_COLUMNS, Math.max(1, w)), h: Math.min(BAG_ROWS, Math.max(1, h)) };
}

function fitsAt(occupancy: (number | null)[], x: number, y: number, w: number, h: number): boolean {
  if (!inBounds(x, y, { w, h })) return false;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (occupancy[(y + dy) * BAG_COLUMNS + x + dx] !== null) return false;
  return true;
}

function occupy(occupancy: (number | null)[], index: number, x: number, y: number, w: number, h: number) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) occupancy[(y + dy) * BAG_COLUMNS + x + dx] = index;
}

function findSpot(occupancy: (number | null)[], w: number, h: number): { x: number; y: number } | null {
  for (let y = 0; y + h <= BAG_ROWS; y++) for (let x = 0; x + w <= BAG_COLUMNS; x++) if (fitsAt(occupancy, x, y, w, h)) return { x, y };
  return null;
}
