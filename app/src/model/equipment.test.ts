import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSave } from "../codec/save";
import type { Catalog } from "./catalog";
import { equipFromBag, equipNew, moveEquipment, occupantOf, slotsFor, unequipToBag } from "./equipment";
import { layoutBag, placeInBag, readInventory } from "./inventory";
import { catalogItemFor, newRecord, type ItemRecord } from "./records";

const rawCatalog = JSON.parse(readFileSync(new URL("../../public/catalog/items.json", import.meta.url), "utf8")) as Omit<Catalog, "byKey" | "templates">;
const templates = JSON.parse(readFileSync(new URL("../../public/catalog/templates.json", import.meta.url), "utf8")) as Catalog["templates"];
const catalog: Catalog = { ...rawCatalog, templates, byKey: new Map(rawCatalog.items.map((item) => [item.key, item])) };
const footprintOf = (record: ItemRecord) => catalogItemFor(record, catalog) ?? { w: 1, h: 1 };
const fresh = new Uint8Array(readFileSync(new URL("../../../test/character_1/save_1/data.sav", import.meta.url)));

describe("equipment", () => {
  it("knows which slots an item can go in", () => {
    expect(slotsFor(catalog.byKey.get("Brass Agate Ring"))).toEqual(["o_inv_ring_1", "o_inv_ring_2"]);
    expect(slotsFor(catalog.byKey.get("Recruit Mail"))).toEqual(["o_inv_armor"]);
    expect(slotsFor(catalog.byKey.get("Fist Shield"))).toEqual(["o_inv_left_hand"]);
    expect(slotsFor(catalog.byKey.get("Recruit Dagger"))).toEqual(["o_inv_right_hand", "o_inv_left_hand"]);
    expect(slotsFor(catalog.byKey.get("Hilda Spear"))).toEqual(["o_inv_right_hand"]);
    expect(slotsFor(catalog.byKey.get("backpack_small"))).toEqual(["o_inv_back"]);
    expect(slotsFor(catalog.byKey.get("bread"))).toEqual([]);
  });

  it("equips from the bag, swaps with the occupant, and writes the game's equipped record shape", async () => {
    let inventory = readInventory((await decodeSave(fresh)).document);
    inventory = placeInBag(inventory, newRecord(catalog.byKey.get("Brass Agate Ring")!, catalog), footprintOf);
    const ring = inventory.bag.findIndex((record) => record[0] === "Brass Agate Ring");
    inventory = equipFromBag(inventory, ring, "o_inv_ring_1", catalog, footprintOf);
    const equippedRing = inventory.equipment[occupantOf(inventory, "o_inv_ring_1")];
    expect(equippedRing.slice(2)).toEqual([-4, -4, 0, -4, -4, 1, 0, "o_inv_ring_1"]);
    expect(inventory.bag.some((record) => record[0] === "Brass Agate Ring")).toBe(false);

    inventory = placeInBag(inventory, newRecord(catalog.byKey.get("Recruit Mail")!, catalog), footprintOf);
    const mail = inventory.bag.findIndex((record) => record[0] === "Recruit Mail");
    expect(() => equipFromBag(inventory, mail, "o_inv_head", catalog, footprintOf)).toThrow(/cannot go in that slot/);
    const before = layoutBag(inventory.bag, footprintOf).placements.find((p) => p.index === mail)!;
    inventory = equipFromBag(inventory, mail, "o_inv_armor", catalog, footprintOf);
    expect(inventory.equipment[occupantOf(inventory, "o_inv_armor")][0]).toBe("Recruit Mail");
    const cuirass = inventory.bag.findIndex((record) => record[0] === "Arna Cuirass");
    expect(cuirass).toBeGreaterThanOrEqual(0);
    const [compartment, cell, , charges, stack, flag, swapped, slot] = inventory.bag[cuirass].slice(2);
    expect([compartment, cell, charges, stack, flag, swapped, slot]).toEqual([0, before.y * 10 + before.x, -4, -4, 0, 0, "N/A"]);
  });

  it("enforces two-handed weapons and the off-hand", async () => {
    let inventory = readInventory((await decodeSave(fresh)).document);
    inventory = placeInBag(inventory, newRecord(catalog.byKey.get("Hilda Spear")!, catalog), footprintOf);
    const spear = inventory.bag.findIndex((record) => record[0] === "Hilda Spear");
    expect(() => equipFromBag(inventory, spear, "o_inv_right_hand", catalog, footprintOf)).toThrow(/both hands/);
    const shield = occupantOf(inventory, "o_inv_left_hand");
    inventory = unequipToBag(inventory, shield, footprintOf);
    expect(inventory.bag.some((record) => record[0] === "Fist Shield")).toBe(true);
    inventory = equipFromBag(inventory, spear, "o_inv_right_hand", catalog, footprintOf);
    expect(inventory.equipment[occupantOf(inventory, "o_inv_right_hand")][0]).toBe("Hilda Spear");
    expect(inventory.bag.some((record) => record[0] === "Arna Sword")).toBe(true);
    const shieldInBag = inventory.bag.findIndex((record) => record[0] === "Fist Shield");
    expect(() => equipFromBag(inventory, shieldInBag, "o_inv_left_hand", catalog, footprintOf)).toThrow(/both hands/);
  });

  it("moves between slots and equips new items into empty slots", async () => {
    let inventory = readInventory((await decodeSave(fresh)).document);
    const shoes = occupantOf(inventory, "o_inv_boots");
    expect(() => moveEquipment(inventory, shoes, "o_inv_head", catalog)).toThrow(/cannot go/);
    inventory = equipNew(inventory, newRecord(catalog.byKey.get("Brass Signet")!, catalog), "o_inv_ring_2", catalog);
    const signet = occupantOf(inventory, "o_inv_ring_2");
    inventory = moveEquipment(inventory, signet, "o_inv_ring_1", catalog);
    expect(occupantOf(inventory, "o_inv_ring_2")).toBe(-1);
    expect(inventory.equipment[occupantOf(inventory, "o_inv_ring_1")][0]).toBe("Brass Signet");
    expect(() => equipNew(inventory, newRecord(catalog.byKey.get("Brass Agate Ring")!, catalog), "o_inv_ring_1", catalog)).toThrow(/taken/);
  });
});
