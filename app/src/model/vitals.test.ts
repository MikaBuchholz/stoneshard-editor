import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSave } from "../codec/save";
import type { Catalog } from "./catalog";
import { setCharacterField } from "./character";
import { energyBreakdown, healthBreakdown } from "./vitals";

const rawCatalog = JSON.parse(readFileSync(new URL("../../public/catalog/items.json", import.meta.url), "utf8")) as Omit<Catalog, "byKey" | "templates">;
const catalog: Catalog = { ...rawCatalog, templates: {}, byKey: new Map(rawCatalog.items.map((item) => [item.key, item])) };
const fresh = new Uint8Array(readFileSync(new URL("../../fixtures/character_1/save_1/data.sav", import.meta.url)));

describe("max health and energy", () => {
  it("reproduces a fresh character's totals from base, attributes and gear", async () => {
    const { document } = await decodeSave(fresh);
    const health = healthBreakdown(document, catalog);
    // Vitality 11 clears no threshold and her gear grants no max health, so she sits on the base.
    expect(health.parts).toEqual([{ label: "Base", amount: 100 }]);
    expect(health.total).toBe(100);
    expect(health.current).toBe(100);

    const energy = energyBreakdown(document, catalog);
    expect(energy.parts).toEqual([
      { label: "Base", amount: 60 },
      { label: "Vitality 11 × 4", amount: 44 },
      { label: "Der Vyrne Heirloom Cuirass", amount: -2 },
    ]);
    // She is brand new and at full energy, which is what the save records.
    expect(energy.total).toBe(102);
    expect(energy.current).toBe(102);
  });

  it("adds a health threshold once Vitality reaches 15", async () => {
    const { document } = await decodeSave(fresh);
    const raised = setCharacterField(document, "Vitality", 20);
    const health = healthBreakdown(raised, catalog);
    expect(health.parts).toContainEqual({ label: "Vitality thresholds (15, 20)", amount: 30 });
    expect(health.total).toBe(130);
    expect(energyBreakdown(raised, catalog).total).toBe(138);
  });
});
