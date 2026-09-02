import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSave } from "../codec/save";
import { setTotalGold, totalGold } from "./character";
import { layoutBag, moveInBag, placeInBag, readInventory, removeFromBag, sortBag, swapInBag, writeInventory } from "./inventory";
import { isEmptyRecord, newGoldRecord, newObjectRecord, type ItemRecord } from "./records";
import type { CatalogItem } from "./catalog";

const realSave = new Uint8Array(readFileSync(new URL("../../../test/character_1/save_2/data.sav", import.meta.url)));
const freshSave = new Uint8Array(readFileSync(new URL("../../../test/character_1/save_1/data.sav", import.meta.url)));

const bearFat: CatalogItem = {
  key: "bear_fat", kind: "object", objectName: "o_inv_bear_fat", name: "Bear Fat", category: "food",
  subcategory: "alchemy", material: "organic", tags: "rare", price: 35, stacks: 2, hidden: false, w: 2, h: 1,
};

const sizes: Record<string, { w: number; h: number }> = { big: { w: 4, h: 3 }, wide: { w: 2, h: 1 }, tall: { w: 1, h: 2 }, bear_fat: { w: 2, h: 1 } };
const footprint = (record: ItemRecord) => sizes[record[1].idName as string] ?? { w: 1, h: 1 };
const item = (key: string, cell = 0): ItemRecord => [`o_inv_${key}`, { idName: key }, 0, cell, 0, 1, -4, 0, 0, "N/A"];
const at = (placements: ReturnType<typeof layoutBag>["placements"], index: number) => {
  const p = placements.find((entry) => entry.index === index)!;
  return [p.x, p.y];
};

describe("inventory model", () => {
  it("splits the real save into equipment and bag, and writes it back unchanged", async () => {
    const { document } = await decodeSave(realSave);
    const inventory = readInventory(document);
    expect(inventory.equipment).toHaveLength(12);
    expect(inventory.bag).toHaveLength(20);
    expect(inventory.bag.filter(isEmptyRecord)).toHaveLength(18);
    expect(writeInventory(document, inventory).inventoryDataList).toEqual(document.inventoryDataList);
  });

  it("keeps interleaved equipment and bag entries in their original order, and reads stored cells", async () => {
    const { document } = await decodeSave(freshSave);
    const inventory = readInventory(document);
    expect(inventory.equipment).toHaveLength(6);
    expect(inventory.bag).toHaveLength(11);
    expect(writeInventory(document, inventory).inventoryDataList).toEqual(document.inventoryDataList);
    const { placements, overflow } = layoutBag(inventory.bag, (record) => ({ o_inv_torch: { w: 1, h: 2 }, o_inv_lockpicks: { w: 2, h: 1 }, o_inv_moneybag: { w: 1, h: 2 } })[record[0]] ?? { w: 1, h: 1 });
    expect(overflow).toEqual([]);
    const torch = inventory.bag.findIndex((record) => record[0] === "o_inv_torch");
    const lockpicks = inventory.bag.findIndex((record) => record[0] === "o_inv_lockpicks");
    expect(at(placements, torch)).toEqual([0, 2]);
    expect(at(placements, lockpicks)).toEqual([2, 2]);
  });

  it("packs unplaced items top-left and honors stored cells", () => {
    const packed = layoutBag([item("big"), item("wide"), item("tall")], footprint);
    expect(packed.placements.map((p) => [p.x, p.y])).toEqual([[0, 0], [4, 0], [6, 0]]);
    const stored = layoutBag([item("wide", 23), item("tall", 9), item("wide", 23)], footprint);
    expect(at(stored.placements, 0)).toEqual([3, 2]);
    expect(at(stored.placements, 1)).toEqual([9, 0]);
    expect(at(stored.placements, 2)).toEqual([0, 0]);
    const full = layoutBag([item("big"), item("big"), item("big"), item("big")], footprint);
    expect(full.overflow).toEqual([2, 3]);
  });

  it("places, moves and swaps with collision and bounds checks", async () => {
    const { document } = await decodeSave(realSave);
    let inventory = readInventory(document);
    inventory = placeInBag(inventory, newObjectRecord(bearFat, 2), footprint, { x: 8, y: 4 });
    const added = inventory.bag.findIndex((record) => record[0] === "o_inv_bear_fat" && record[6] === 2);
    expect(inventory.bag[added][3]).toBe(48);
    expect(() => placeInBag(inventory, newObjectRecord(bearFat), footprint, { x: 9, y: 4 })).toThrow(/fit/);
    expect(() => placeInBag(inventory, newObjectRecord(bearFat), footprint, { x: 7, y: 4 })).toThrow(/fit/);

    inventory = moveInBag(inventory, added, 4, 2, footprint);
    expect(at(layoutBag(inventory.bag, footprint).placements, added)).toEqual([4, 2]);
    expect(() => moveInBag(inventory, added, 0, 0, footprint)).toThrow(/overlap/);

    const charm = inventory.bag.findIndex((record) => record[0] === "o_inv_hilda_trinket");
    expect(() => swapInBag(inventory, added, charm, footprint)).toThrow(/trade places/);
    const original = inventory.bag.findIndex((record) => record[0] === "o_inv_bear_fat" && record[6] !== 2);
    const before = layoutBag(inventory.bag, footprint);
    inventory = swapInBag(inventory, added, original, footprint);
    const after = layoutBag(inventory.bag, footprint);
    expect(at(after.placements, added)).toEqual(at(before.placements, original));
    expect(at(after.placements, original)).toEqual(at(before.placements, added));

    inventory = removeFromBag(inventory, added);
    expect(isEmptyRecord(inventory.bag[added])).toBe(true);
  });

  it("sorts and re-packs the bag, and removes several items at once", () => {
    const inventory = { equipment: [], bag: [item("tall", 40), item("big", 7), ["empty", {}, 0, 0, 0, 0, 0, 0, 0, "N/A"] as ItemRecord, item("wide", 30)], sequence: [] };
    const area = (record: ItemRecord) => footprint(record).w * footprint(record).h;
    const byAreaDescThenName = (a: ItemRecord, b: ItemRecord) => area(b) - area(a) || String(a[1].idName).localeCompare(String(b[1].idName));
    const sorted = sortBag(inventory, footprint, byAreaDescThenName);
    expect(sorted.bag.slice(0, 3).map((record) => record[1].idName)).toEqual(["big", "tall", "wide"]);
    expect(sorted.bag.slice(0, 3).map((record) => record[3])).toEqual([0, 4, 5]);
    expect(sorted.bag).toHaveLength(3);
    const removed = removeFromBag(sorted, 0, 2);
    expect(removed.bag.filter((record) => !isEmptyRecord(record)).map((record) => record[1].idName)).toEqual(["tall"]);
  });

  it("reads and sets gold through a purse when present, else loose", async () => {
    const { document } = await decodeSave(realSave);
    expect(totalGold(document)).toBe(0);
    const withLoose = setTotalGold(document, 150);
    expect(totalGold(withLoose)).toBe(150);
    expect(readInventory(withLoose).bag.filter((record) => record[0] === "o_inv_gold")).toHaveLength(1);

    let inventory = readInventory(document);
    inventory = placeInBag(inventory, ["o_inv_moneybag", { idName: "moneybag", lootList: [newGoldRecord(10)] }, 0, 0, 0, 1, 0, 0, 0, "N/A"], footprint);
    const withPurse = writeInventory(document, inventory);
    expect(totalGold(withPurse)).toBe(10);
    const updated = setTotalGold(withPurse, 999);
    expect(totalGold(updated)).toBe(999);
    const purse = readInventory(updated).bag.find((record) => record[0] === "o_inv_moneybag")!;
    expect((purse[1].lootList as unknown[]).length).toBe(1);
  });
});
