import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSave } from "../codec/save";
import type { Catalog } from "./catalog";
import { newEquipmentRecord, newObjectRecord, type ItemRecord } from "./records";

const rawCatalog = JSON.parse(readFileSync(new URL("../../public/catalog/items.json", import.meta.url), "utf8")) as Omit<Catalog, "byKey" | "templates">;
const templates = JSON.parse(readFileSync(new URL("../../public/catalog/templates.json", import.meta.url), "utf8")) as Catalog["templates"];
const catalog: Catalog = { ...rawCatalog, templates, byKey: new Map(rawCatalog.items.map((item) => [item.key, item])) };

async function realRecords(path: string): Promise<ItemRecord[]> {
  const bytes = new Uint8Array(readFileSync(new URL(path, import.meta.url)));
  const { document } = await decodeSave(bytes);
  return (document.inventoryDataList as ItemRecord[]).filter((record) => catalog.byKey.get(record[0])?.kind !== undefined && catalog.byKey.get(record[0])?.kind !== "object");
}

/** Fields the game rolls per item or sets while playing; everything else must match the table-generated record. */
const ROLLED = new Set(["Duration", "HasOwner", "is_trade_item"]);

describe("newEquipmentRecord", () => {
  it("reproduces plain (quality 1 or unique) equipment from a real save", async () => {
    const records = await realRecords("../../fixtures/character_1/save_1/data.sav");
    const plain = records.filter((record) => record[1].quality === 1 || record[1].rarity === "Unique");
    expect(plain.length).toBeGreaterThanOrEqual(6);
    for (const real of plain) {
      const generated = newEquipmentRecord(catalog.byKey.get(real[0])!);
      const expected = Object.fromEntries(Object.entries(real[1]).filter(([key]) => !ROLLED.has(key)));
      const actual = Object.fromEntries(Object.entries(generated[1]).filter(([key]) => !ROLLED.has(key)));
      expect(actual, real[0]).toEqual(expected);
      expect(generated[1].Duration).toBe(real[1].MaxDuration);
    }
  });
});

describe("newObjectRecord", () => {
  it("gives containers a contents list and a stack field", () => {
    const purse = newObjectRecord(catalog.byKey.get("moneybag")!, 1, catalog.templates.moneybag);
    expect(purse[1].lootList).toEqual([]);
    expect(purse[1].Stack).toBe(0);
    const generic = newObjectRecord({ ...catalog.byKey.get("moneybag")!, key: "made_up", objectName: "o_inv_made_up" });
    expect(generic[1].lootList).toEqual([]);
  });

  it("uses harvested templates so charges, damage and freshness match real records", () => {
    const salve = newObjectRecord(catalog.byKey.get("salve")!, 1, catalog.templates.salve);
    expect(salve[1].charge).toBe(3);
    expect(salve[5]).toBe(3);
    const torch = newObjectRecord(catalog.byKey.get("torch")!, 1, catalog.templates.torch);
    expect(torch[1].MaxDuration).toBe(50);
    expect(torch[1].Duration).toBe(50);
    expect(torch[1].Main).toEqual(["Blunt_Damage", 8]);
    const bread = newObjectRecord(catalog.byKey.get("bread")!, 1, catalog.templates.bread);
    expect(bread[1].Fresh).toBe(120);
    expect(bread[1].Effects_Duration).toBe(60);
    const bullets = newObjectRecord(catalog.byKey.get("ammo_bullet")!, 10, catalog.templates.ammo_bullet);
    expect(bullets[1].Weapon_Damage).toBe(65);
    expect(bullets[6]).toBe(10);
  });

  it("falls back to the table-derived shape for items without a template", () => {
    const acorn = catalog.byKey.get("acorn")!;
    const record = newObjectRecord(acorn, 1);
    expect(record[1]).toMatchObject({ idName: "acorn", Material: acorn.material, tags: acorn.tags, is_trade_item: 1 });
    expect(record[1].max_charge).toBeUndefined();
  });
});
