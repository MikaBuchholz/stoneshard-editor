import type { SaveDocument } from "../codec/save";
import { isGold, isItemRecord, newGoldRecord, type ItemRecord } from "./records";
import { readInventory, writeInventory, type Inventory } from "./inventory";
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
  { key: "HP", label: "Health" },
  { key: "MP", label: "Energy" },
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
 * Put `amount` coins in the first purse if there is one, otherwise in a loose stack in the bag.
 * Every other coin stack in the bag or purses is removed so the total is exactly `amount`.
 */
export function setTotalGold(document: SaveDocument, amount: number): SaveDocument {
  const inventory = readInventory(document);
  const equipment = inventory.equipment.map(cloneRecord);
  let bag = inventory.bag.map(cloneRecord);
  for (const record of [...equipment, ...bag]) {
    if (PURSE_HEADS.has(record[0]) && Array.isArray(record[1].lootList)) {
      record[1].lootList = (record[1].lootList as unknown[]).filter((entry) => !(isItemRecord(entry) && isGold(entry)));
    }
  }
  bag = bag.map((record) => (isGold(record) ? emptyRecord() : record));
  if (amount <= 0) return writeInventory(document, { equipment, bag, sequence: inventory.sequence });

  const purse = [...equipment, ...bag].find((record) => PURSE_HEADS.has(record[0]));
  if (purse) {
    const list = Array.isArray(purse[1].lootList) ? (purse[1].lootList as unknown[]) : [];
    purse[1].lootList = [markAdded(newGoldRecord(amount)), ...list];
    return writeInventory(document, { equipment, bag, sequence: inventory.sequence });
  }
  const free = bag.findIndex((record) => record[0] === "empty");
  const coins = markAdded(newGoldRecord(amount));
  if (free >= 0) bag[free] = coins;
  else bag.push(coins);
  return writeInventory(document, { equipment, bag, sequence: inventory.sequence });
}
