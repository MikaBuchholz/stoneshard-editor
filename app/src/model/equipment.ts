import type { Catalog, CatalogItem } from "./catalog";
import { inBounds, itemsUnder, layoutBag, placeInBag, type FootprintOf, type Inventory } from "./inventory";
import { asLooseRecord, catalogItemFor, cloneRecord, emptyRecord, isEmptyRecord, NOT_APPLICABLE, type ItemRecord } from "./records";

/**
 * Equipping and unequipping. An equipped record has no grid position (-4, -4), a flag in the
 * "equipped" field (1, or 2 for the off-hand, as the game writes for a fresh character), and the
 * slot object name in the last field. Taking an item off turns it back into a loose bag record.
 */

const ARMOR_SLOTS: Record<string, string[]> = {
  Chest: ["o_inv_armor"],
  Head: ["o_inv_head"],
  Arms: ["o_inv_gloves"],
  Legs: ["o_inv_boots"],
  Waist: ["o_inv_belt"],
  Amulet: ["o_inv_neck"],
  Ring: ["o_inv_ring_1", "o_inv_ring_2"],
  Back: ["o_inv_back"],
  shield: ["o_inv_left_hand"],
};

const TWO_HANDED = new Set(["2hsword", "2haxe", "2hmace", "2hStaff", "bow", "crossbow", "spear"]);
const HANDS = ["o_inv_right_hand", "o_inv_left_hand"];

/** Slots an item may be equipped in, empty for things that cannot be worn. */
export function slotsFor(item: CatalogItem | undefined): string[] {
  if (!item) return [];
  if (item.kind === "armor") return ARMOR_SLOTS[item.slot ?? ""] ?? [];
  if (item.kind === "weapon") return isTwoHanded(item) ? ["o_inv_right_hand"] : HANDS;
  if (item.category === "backpack") return ["o_inv_back"];
  if (item.category === "bag" && /ammo|quiver/.test(item.key)) return ["o_inv_left_hand"];
  return [];
}

export function isTwoHanded(item: CatalogItem | undefined): boolean {
  return item?.kind === "weapon" && TWO_HANDED.has(item.slot ?? "");
}

export function occupantOf(inventory: Inventory, slot: string): number {
  return inventory.equipment.findIndex((record) => record[9] === slot && !record[8]);
}

function equipped(record: ItemRecord, slot: string): ItemRecord {
  const copy = cloneRecord(record);
  copy[2] = NOT_APPLICABLE;
  copy[3] = NOT_APPLICABLE;
  copy[7] = slot === "o_inv_left_hand" ? 2 : 1;
  copy[8] = 0;
  copy[9] = slot;
  return copy;
}

function assertCompatible(record: ItemRecord, slot: string, catalog: Catalog) {
  const item = catalogItemFor(record, catalog);
  if (!slotsFor(item).includes(slot)) throw new Error(`${item?.name ?? record[0]} cannot go in that slot.`);
}

function assertHandsFree(inventory: Inventory, record: ItemRecord, slot: string, catalog: Catalog, ignore: number[]) {
  const item = catalogItemFor(record, catalog);
  const otherHand = slot === "o_inv_right_hand" ? "o_inv_left_hand" : slot === "o_inv_left_hand" ? "o_inv_right_hand" : null;
  if (!otherHand) return;
  const otherIndex = occupantOf(inventory, otherHand);
  if (otherIndex < 0 || ignore.includes(otherIndex)) return;
  const other = catalogItemFor(inventory.equipment[otherIndex], catalog);
  if (isTwoHanded(item)) throw new Error(`${item?.name} needs both hands; take off the off-hand item first.`);
  if (isTwoHanded(other)) throw new Error(`${other?.name} needs both hands; take it off first.`);
}

/** Equip a bag item. If the slot is taken, the current item goes to the bag cell the new one came from when it fits. */
export function equipFromBag(inventory: Inventory, bagIndex: number, slot: string, catalog: Catalog, footprintOf: FootprintOf): Inventory {
  const record = inventory.bag[bagIndex];
  assertCompatible(record, slot, catalog);
  const current = occupantOf(inventory, slot);
  assertHandsFree(inventory, record, slot, catalog, [current]);
  let bag = [...inventory.bag];
  let equipment = [...inventory.equipment];
  bag[bagIndex] = emptyRecord();
  if (current >= 0) {
    const displaced = equipment[current];
    equipment = equipment.filter((_, index) => index !== current);
    const layout = layoutBag(bag, footprintOf);
    const placement = layoutBag(inventory.bag, footprintOf).placements.find((p) => p.index === bagIndex);
    const footprint = footprintOf(displaced);
    const fits = placement && inBounds(placement.x, placement.y, footprint) && itemsUnder(layout, placement.x, placement.y, footprint).length === 0;
    const next = placeInBag({ ...inventory, bag, equipment }, displaced, footprintOf, fits ? { x: placement.x, y: placement.y } : undefined);
    bag = next.bag;
  }
  equipment.push(equipped(record, slot));
  return { ...inventory, bag, equipment };
}

/** Equip a freshly generated record into an empty slot. */
export function equipNew(inventory: Inventory, record: ItemRecord, slot: string, catalog: Catalog): Inventory {
  assertCompatible(record, slot, catalog);
  if (occupantOf(inventory, slot) >= 0) throw new Error("That slot is taken; drop the new item in the bag instead.");
  assertHandsFree(inventory, record, slot, catalog, []);
  return { ...inventory, equipment: [...inventory.equipment, equipped(record, slot)] };
}

/** Take an equipped item off into the bag, at a cell when given, else the first free spot. */
export function unequipToBag(inventory: Inventory, position: number, footprintOf: FootprintOf, at?: { x: number; y: number }): Inventory {
  const record = inventory.equipment[position];
  const without = { ...inventory, equipment: inventory.equipment.filter((_, index) => index !== position) };
  return placeInBag(without, asLooseRecord(record), footprintOf, at);
}

/** Move an equipped item to another slot it fits, swapping with whatever is there when both fit. */
export function moveEquipment(inventory: Inventory, position: number, slot: string, catalog: Catalog): Inventory {
  const record = inventory.equipment[position];
  if (record[9] === slot) return inventory;
  assertCompatible(record, slot, catalog);
  const current = occupantOf(inventory, slot);
  if (current >= 0) assertCompatible(inventory.equipment[current], record[9], catalog);
  assertHandsFree(inventory, record, slot, catalog, [position, current]);
  const equipment = [...inventory.equipment];
  equipment[position] = equipped(record, slot);
  if (current >= 0) equipment[current] = equipped(inventory.equipment[current], record[9]);
  return { ...inventory, equipment };
}

export function hasEmptyRecord(inventory: Inventory): boolean {
  return inventory.bag.some(isEmptyRecord);
}
