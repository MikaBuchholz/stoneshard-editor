import type { Catalog, CatalogItem, Template } from "./catalog";
import { catalogKeyForHead } from "./catalog";

/**
 * One inventory record as the game stores it:
 * [head, properties, compartment, cell, state, charges, stack, equipped, swapped, slot]
 * Numbers use -4 for "not applicable". `slot` is an equipment slot object name or "N/A".
 */
export type ItemRecord = [
  string,
  Record<string, unknown>,
  number,
  number,
  number,
  number,
  number,
  number | boolean,
  number,
  string,
];

export const NOT_APPLICABLE = -4;
export const EMPTY_HEAD = "empty";

export function isItemRecord(value: unknown): value is ItemRecord {
  return Array.isArray(value) && value.length === 10 && typeof value[0] === "string" && typeof value[1] === "object" && value[1] !== null;
}

export function isEmptyRecord(record: ItemRecord): boolean {
  return record[0] === EMPTY_HEAD;
}

export function emptyRecord(): ItemRecord {
  return [EMPTY_HEAD, {}, 0, 0, 0, 0, 0, 0, 0, "N/A"];
}

/** Records created by the editor in this session; the mark survives cloning but is never written to the file. */
const addedHere = new WeakSet<ItemRecord>();

export function markAdded(record: ItemRecord): ItemRecord {
  addedHere.add(record);
  return record;
}

export function wasAddedHere(record: ItemRecord): boolean {
  return addedHere.has(record);
}

export function cloneRecord(record: ItemRecord): ItemRecord {
  const copy = structuredClone(record);
  if (addedHere.has(record)) addedHere.add(copy);
  return copy;
}

export function catalogItemFor(record: ItemRecord, catalog: Catalog): CatalogItem | undefined {
  return catalog.byKey.get(catalogKeyForHead(record[0]));
}

export function displayName(record: ItemRecord, catalog: Catalog): string {
  const item = catalogItemFor(record, catalog);
  if (item) return item.name;
  const idName = record[1].idName;
  return typeof idName === "string" ? idName : record[0];
}

/** Stack count, or null for items that do not stack. The game writes 0 for a lone item, which we show as 1. */
export function stackOf(record: ItemRecord): number | null {
  return record[6] === NOT_APPLICABLE ? null : Math.max(1, record[6]);
}

export function chargesOf(record: ItemRecord): number | null {
  return record[5] === NOT_APPLICABLE ? null : record[5];
}

export function durabilityOf(record: ItemRecord): { current: number; max: number } | null {
  const max = Number(record[1].MaxDuration ?? 0);
  if (!(max > 0)) return null;
  return { current: Number(record[1].Duration ?? max), max };
}

/**
 * A fresh, unequipped record for a catalog object. Uses the property template harvested from a real
 * save when one exists (that is how charges, tool damage and ammo stats are known); otherwise the
 * plain shape the game writes for simple items. Containers always get their contents list.
 */
export function newObjectRecord(item: CatalogItem, count = 1, template?: Template): ItemRecord {
  if (item.kind !== "object" || !item.objectName) throw new Error(`${item.name} cannot be generated from the catalog.`);
  const stackable = (item.stacks ?? 0) > 1 || item.category === "currency";
  const properties: Record<string, unknown> = template
    ? structuredClone(template)
    : {
        Material: item.material || "undefined",
        idName: item.key,
        Duration: 0,
        is_cursed: 0,
        MaxDuration: 0,
        i_index: 0,
        Main: [],
        identified: 1,
        charge: 1,
        Effects_Duration: item.effectDuration ?? 0,
        tags: item.tags ?? "",
      };
  if (item.fresh && properties.Fresh === undefined) properties.Fresh = item.fresh;
  if (item.container) {
    if (!Array.isArray(properties.lootList)) properties.lootList = [];
    if (properties.Stack === undefined) properties.Stack = 0;
  }
  properties.is_trade_item = 1;
  return [item.objectName, properties, 0, 0, 0, Number(properties.charge ?? 1), stackable ? count : NOT_APPLICABLE, 0, 0, "N/A"];
}

const DAMAGE_COLUMNS = [
  "Slashing_Damage", "Piercing_Damage", "Blunt_Damage", "Rending_Damage", "Fire_Damage", "Shock_Damage", "Poison_Damage",
  "Caustic_Damage", "Frost_Damage", "Arcane_Damage", "Unholy_Damage", "Sacred_Damage", "Psionic_Damage",
];

/** Quality tier and the name colour the game pairs with it: plain white for common gear, gold-brown for uniques. */
const QUALITY_BY_RARITY: Record<string, { quality: number; colour: number }> = {
  Common: { quality: 1, colour: 16777215 },
  Unique: { quality: 6, colour: 12339330 },
};

/**
 * A weapon or armor piece exactly as the game rolls a plain one: every stat column from the item table,
 * base quality for its rarity, no enchantment, and full durability. Verified against records in real saves.
 */
export function newEquipmentRecord(item: CatalogItem): ItemRecord {
  if (item.kind !== "weapon" && item.kind !== "armor") throw new Error(`${item.name} is not equipment.`);
  const { quality, colour } = QUALITY_BY_RARITY[item.rarity ?? ""] ?? QUALITY_BY_RARITY.Common;
  const stats = item.stats ?? {};
  const maxDuration = item.maxDuration ?? 0;
  const properties: Record<string, unknown> = {
    Colour: colour,
    Curse: [],
    Suffix: `${quality} ${item.slot ?? ""}`,
    Material: item.material || "undefined",
    key: "",
    idName: item.key,
    Duration: maxDuration,
    is_cursed: 0,
    MaxDuration: maxDuration,
    rarity: item.rarity ?? "Common",
    identified: 1,
    charge: NOT_APPLICABLE,
    tags: item.tags ?? "",
    quality,
    cursedQuality: NOT_APPLICABLE,
    ...stats,
  };
  if (item.kind === "weapon") {
    const damageType = DAMAGE_COLUMNS.filter((column) => stats[column] !== undefined).sort((a, b) => stats[b] - stats[a])[0];
    const damage = damageType ? stats[damageType] : 0;
    properties.Metatype = "Weapon";
    properties.DamageType = damageType ?? "";
    properties.DMG = damage;
    properties.Main = damageType ? [damageType, damage] : [];
    properties.Range = item.range ?? 1;
    if ((item.range ?? 1) > 1) properties.Rng = item.range;
  } else {
    const defence = stats.DEF ?? 0;
    properties.Metatype = "Armor";
    properties.DEF = defence;
    properties.Main = defence > 0 ? ["DEF", defence] : [];
    properties.Armor_Type = item.armorClass || "Light";
  }
  return [item.key, properties, 0, 0, 0, NOT_APPLICABLE, NOT_APPLICABLE, 0, 0, "N/A"];
}

/** A fresh record for any addable catalog item. */
export function newRecord(item: CatalogItem, catalog: Catalog, count = 1): ItemRecord {
  return markAdded(item.kind === "object" ? newObjectRecord(item, count, catalog.templates[item.key]) : newEquipmentRecord(item));
}

/** Whether generating this item is backed by a real record rather than a generic shape. */
export function hasTemplate(item: CatalogItem, catalog: Catalog): boolean {
  return item.kind !== "object" || catalog.templates[item.key] !== undefined;
}

/** Coins as the game writes them; the amount lives in the stack field. */
export function newGoldRecord(amount: number): ItemRecord {
  return [
    "o_inv_gold",
    { Material: "gold", idName: "gold", Duration: 0, is_cursed: 0, MaxDuration: 0, i_index: 6, Main: [], identified: 1, charge: 1, Effects_Duration: 0, tags: "" },
    0, 0, 6, 1, amount, 0, 0, "N/A",
  ];
}

export function isGold(record: ItemRecord): boolean {
  return record[0] === "o_inv_gold";
}

/** Strip equipment placement so a record can sit in a bag slot. */
export function asLooseRecord(record: ItemRecord): ItemRecord {
  const copy = cloneRecord(record);
  copy[2] = 0;
  copy[3] = 0;
  copy[7] = 0;
  copy[8] = 0;
  copy[9] = "N/A";
  return copy;
}
