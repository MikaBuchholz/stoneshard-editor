import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSave } from "../codec/save";
import { COIN_PILE_CAPACITY, PURSE_CAPACITY, setTotalGold, totalGold } from "./character";
import { layoutBag, moveInBag, placeInBag, readInventory, removeFromBag, sortBag, swapInBag, writeInventory } from "./inventory";
import { isEmptyRecord, newObjectRecord, type ItemRecord } from "./records";
import type { CatalogItem } from "./catalog";

const freshSave = new Uint8Array(readFileSync(new URL("../../fixtures/character_1/save_1/data.sav", import.meta.url)));

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
  it("keeps placeholder entries in place when an item is removed", async () => {
    const { document } = await decodeSave(freshSave);
    const original = readInventory(document);
    const emptied = removeFromBag(original, 3);
    expect(emptied.bag.filter(isEmptyRecord)).toHaveLength(1);
    const written = writeInventory(document, emptied).inventoryDataList as ItemRecord[];
    expect(written).toHaveLength((document.inventoryDataList as unknown[]).length);
    expect(readInventory({ ...document, inventoryDataList: written }).bag.filter(isEmptyRecord)).toHaveLength(1);
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
    const { document } = await decodeSave(freshSave);
    let inventory = readInventory(document);
    inventory = placeInBag(inventory, newObjectRecord(bearFat, 2), footprint, { x: 8, y: 4 });
    const added = inventory.bag.findIndex((record) => record[0] === "o_inv_bear_fat" && record[6] === 2);
    expect(inventory.bag[added][3]).toBe(48);
    expect(() => placeInBag(inventory, newObjectRecord(bearFat), footprint, { x: 9, y: 4 })).toThrow(/fit/);
    expect(() => placeInBag(inventory, newObjectRecord(bearFat), footprint, { x: 7, y: 4 })).toThrow(/fit/);

    inventory = moveInBag(inventory, added, 4, 2, footprint);
    expect(at(layoutBag(inventory.bag, footprint).placements, added)).toEqual([4, 2]);
    expect(() => moveInBag(inventory, added, 0, 0, footprint)).toThrow(/overlap/);

    inventory = removeFromBag(inventory, added);
    expect(isEmptyRecord(inventory.bag[added])).toBe(true);
  });

  it("swaps two items only when each fits where the other sat", () => {
    // A 4x3 item at the top-left and a 1x1 in the bottom-right corner: the big one cannot fit there.
    const cornered = { equipment: [], bag: [item("big", 0), item("dot", 49)], sequence: [] };
    expect(() => swapInBag(cornered, 0, 1, footprint)).toThrow(/trade places/);

    // A 2x1 and a 1x2 with room around them trade places.
    const roomy = { equipment: [], bag: [item("wide", 0), item("tall", 2)], sequence: [] };
    const before = layoutBag(roomy.bag, footprint);
    const after = layoutBag(swapInBag(roomy, 0, 1, footprint).bag, footprint);
    expect(at(after.placements, 0)).toEqual(at(before.placements, 1));
    expect(at(after.placements, 1)).toEqual(at(before.placements, 0));
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
    const { document } = await decodeSave(freshSave);
    // The starting character carries her coins inside a purse.
    expect(totalGold(document)).toBe(250);
    const updated = setTotalGold(document, 999, footprint);
    expect(totalGold(updated)).toBe(999);
    const purse = readInventory(updated).bag.find((record) => record[0] === "o_inv_moneybag")!;
    expect((purse[1].lootList as ItemRecord[]).filter((entry) => entry[0] === "o_inv_gold")).toHaveLength(1);
    expect(readInventory(updated).bag.filter((record) => record[0] === "o_inv_gold")).toHaveLength(0);

    // With no purse the coins go loose into the bag instead.
    const inventory = readInventory(document);
    const purseIndex = inventory.bag.findIndex((record) => record[0] === "o_inv_moneybag");
    const withoutPurse = writeInventory(document, removeFromBag(inventory, purseIndex));
    expect(totalGold(withoutPurse)).toBe(0);
    const loose = setTotalGold(withoutPurse, 150, footprint);
    expect(totalGold(loose)).toBe(150);
    // 150 crowns is more than one pile holds, so it lands as 100 + 50.
    expect(readInventory(loose).bag.filter((record) => record[0] === "o_inv_gold").map((record) => record[6]).sort((a, b) => b - a)).toEqual([100, 50]);
  });

  it("respects the game's purse and pile limits, and settles at what fits", async () => {
    const { document } = await decodeSave(freshSave);
    const inventory = readInventory(document);
    const purseIndex = inventory.bag.findIndex((record) => record[0] === "o_inv_moneybag");

    // One purse takes 2000; the rest spills into 100-crown piles on the grid.
    const spilled = setTotalGold(document, PURSE_CAPACITY + 250, footprint);
    expect(totalGold(spilled)).toBe(PURSE_CAPACITY + 250);
    const purse = readInventory(spilled).bag[purseIndex];
    expect((purse[1].lootList as ItemRecord[]).find((entry) => entry[0] === "o_inv_gold")![6]).toBe(PURSE_CAPACITY);
    const piles = readInventory(spilled).bag.filter((record) => record[0] === "o_inv_gold").map((record) => record[6]);
    expect(piles.every((pile) => pile <= COIN_PILE_CAPACITY)).toBe(true);
    expect(piles.reduce((sum, pile) => sum + pile, 0)).toBe(250);

    // Far more than the bag can hold stops at capacity instead of writing one impossible stack.
    const capped = setTotalGold(document, 10_000_000, footprint);
    const total = totalGold(capped);
    expect(total).toBeGreaterThan(PURSE_CAPACITY);
    expect(total).toBeLessThan(10_000_000);
    expect(readInventory(capped).bag.filter((record) => record[0] === "o_inv_gold").every((record) => record[6] <= COIN_PILE_CAPACITY)).toBe(true);
  });
});
