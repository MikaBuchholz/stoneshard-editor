import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSave } from "../codec/save";
import type { Catalog } from "./catalog";
import { layoutBag, placeInBag, readInventory, removeFromBag, type Inventory } from "./inventory";
import { catalogItemFor, newRecord } from "./records";

const rawCatalog = JSON.parse(readFileSync(new URL("../../public/catalog/items.json", import.meta.url), "utf8")) as Omit<Catalog, "byKey" | "templates">;
const templates = JSON.parse(readFileSync(new URL("../../public/catalog/templates.json", import.meta.url), "utf8")) as Catalog["templates"];
const catalog: Catalog = { ...rawCatalog, templates, byKey: new Map(rawCatalog.items.map((item) => [item.key, item])) };
const footprintOf = (record: Parameters<typeof catalogItemFor>[0]) => catalogItemFor(record, catalog) ?? { w: 1, h: 1 };

function cells(inventory: Inventory) {
  return inventory.bag.filter((r) => r[0] !== "empty").map((r) => `${r[0]}@${r[3]}`);
}

describe("bag positions", () => {
  it("adding equipment never produces duplicate stored cells", async () => {
    const bytes = new Uint8Array(readFileSync(new URL("../../fixtures/character_1/save_1/data.sav", import.meta.url)));
    let inventory = readInventory((await decodeSave(bytes)).document);
    const toRemove = inventory.bag.map((r, i) => (r[0] !== "o_inv_map_osbrook" ? i : -1)).filter((i) => i >= 0);
    inventory = removeFromBag(inventory, ...toRemove);
    for (const name of ["Ceremonial Armor", "Orient Tower Shield", "Aldwynn Sabatons", "Knight Gauntlets", "Grand Bascinet", "Radiant Sword", "Knightly Belt"]) {
      inventory = placeInBag(inventory, newRecord(catalog.byKey.get(name)!, catalog), footprintOf);
      const stored = inventory.bag.filter((r) => r[0] !== "empty").map((r) => r[3]);
      expect(new Set(stored).size, `after ${name}: ${cells(inventory).join(" ")}`).toBe(stored.length);
      expect(layoutBag(inventory.bag, footprintOf).overflow).toEqual([]);
    }
  });
});
