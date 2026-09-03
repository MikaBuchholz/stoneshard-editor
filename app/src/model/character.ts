import type { SaveDocument } from "../codec/save";
import { isGold, isItemRecord, newGoldRecord, type ItemRecord } from "./records";
import { placeInBag, readInventory, writeInventory, type FootprintOf, type Inventory } from "./inventory";
import { cloneRecord, emptyRecord, markAdded } from "./records";

export interface CharacterField {
  key: string;
  label: string;
  hint?: string;
}

/** Fields safe to edit directly. The save's SP and AP keys are swapped relative to their names. */
export const CHARACTER_FIELDS: CharacterField[] = [
  { key: "STR", label: "Strength" },
  { key: "AGL", label: "Agility" },
  { key: "PRC", label: "Perception" },
  { key: "Vitality", label: "Vitality" },
  { key: "WIL", label: "Willpower" },
  { key: "LVL", label: "Level" },
  { key: "XP", label: "Experience" },
  { key: "AP", label: "Stat points", hint: "Unspent attribute points" },
  { key: "SP", label: "Ability points", hint: "Unspent ability points" },
];

export const IDENTITY_FIELDS = ["nameKey", "classKey", "raceKey", "sexKey"] as const;

export function characterMap(document: SaveDocument): Record<string, unknown> {
  const map = document.characterDataMap;
  if (!map || typeof map !== "object") throw new Error("This save has no character data.");
  return map as Record<string, unknown>;
}

export function setCharacterField(document: SaveDocument, key: string, value: unknown): SaveDocument {
  return { ...document, characterDataMap: { ...characterMap(document), [key]: value } };
}

export function saveVersion(document: SaveDocument): string | undefined {
  const game = document.gameDataMap;
  if (!game || typeof game !== "object") return undefined;
  const version = (game as Record<string, unknown>).wipeVersion;
  return typeof version === "string" ? version : undefined;
}

/** Purses and belt pouches: the containers coins normally live in. */
const PURSE_HEADS = new Set(["o_inv_moneybag", "o_inv_bag_belt"]);

/** The game's own limits: a purse holds 2000 crowns, a loose pile on the grid holds 100. */
export const PURSE_CAPACITY = 2000;
export const COIN_PILE_CAPACITY = 100;

function contents(record: ItemRecord): ItemRecord[] {
  const list = record[1].lootList;
  return Array.isArray(list) ? list.filter(isItemRecord) : [];
}

function goldStacks(inventory: Inventory): ItemRecord[] {
  const stacks: ItemRecord[] = [];
  for (const record of [...inventory.equipment, ...inventory.bag]) {
    if (isGold(record)) stacks.push(record);
    if (PURSE_HEADS.has(record[0])) stacks.push(...contents(record).filter(isGold));
  }
  return stacks;
}

export function totalGold(document: SaveDocument): number {
  return goldStacks(readInventory(document)).reduce((sum, record) => sum + Math.max(0, record[6]), 0);
}

/**
 * Spread `amount` coins the way the game stores them: purses first at 2000 each, then loose 1x1 piles
 * of up to 100 in free bag cells. Existing coins are cleared first, so the total ends up exactly
 * `amount` — or as much of it as the purses and the remaining grid space can hold.
 */
export function setTotalGold(document: SaveDocument, amount: number, footprintOf: FootprintOf): SaveDocument {
  const inventory = readInventory(document);
  const equipment = inventory.equipment.map(cloneRecord);
  let bag = inventory.bag.map(cloneRecord);
  for (const record of [...equipment, ...bag]) {
    if (PURSE_HEADS.has(record[0]) && Array.isArray(record[1].lootList)) {
      record[1].lootList = (record[1].lootList as unknown[]).filter((entry) => !(isItemRecord(entry) && isGold(entry)));
    }
  }
  bag = bag.map((record) => (isGold(record) ? emptyRecord() : record));

  let left = Math.max(0, Math.floor(amount));
  for (const record of [...equipment, ...bag]) {
    if (left <= 0) break;
    if (!PURSE_HEADS.has(record[0])) continue;
    const take = Math.min(left, PURSE_CAPACITY);
    const list = Array.isArray(record[1].lootList) ? (record[1].lootList as unknown[]) : [];
    record[1].lootList = [markAdded(newGoldRecord(take)), ...list];
    left -= take;
  }

  let filled: Inventory = { equipment, bag, sequence: inventory.sequence };
  while (left > 0) {
    const take = Math.min(left, COIN_PILE_CAPACITY);
    try {
      filled = placeInBag(filled, markAdded(newGoldRecord(take)), footprintOf);
    } catch {
      break; // Out of grid space: the field settles at what actually fits.
    }
    left -= take;
  }
  return writeInventory(document, filled);
}
