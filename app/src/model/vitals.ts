import type { SaveDocument } from "../codec/save";
import type { Catalog } from "./catalog";
import { characterMap } from "./character";
import { readInventory } from "./inventory";
import { displayName } from "./records";

/**
 * Max health and max energy are not stored. The game recomputes them on load, which is why editing
 * the save's HP and MP fields does nothing: those hold the *current* values and are clamped to the
 * maximum the game works out from attributes, equipment and skills.
 *
 * Base values are derived from a brand-new character at full health (100 health, 60 energy).
 * The attribute rules come from the game's own attribute tooltips:
 *   Vitality grants +4 Max Energy per point, and +15 Max Health at 15, 20, 25 and 30 points.
 */

export const BASE_HEALTH = 100;
export const BASE_ENERGY = 60;
export const VITALITY_THRESHOLDS = [15, 20, 25, 30];
export const HEALTH_PER_THRESHOLD = 15;
export const ENERGY_PER_VITALITY = 4;

export interface VitalPart {
  label: string;
  amount: number;
}

export interface VitalBreakdown {
  /** The maximum the game should arrive at from the parts below. */
  total: number;
  /** What the save holds right now, which the game treats as the current value. */
  current: number | null;
  parts: VitalPart[];
}

/** Equipped items, ignoring the weapons parked in the swap set. */
function activeEquipment(document: SaveDocument) {
  return readInventory(document).equipment.filter((record) => !record[8]);
}

function statPart(document: SaveDocument, catalog: Catalog, property: string): VitalPart[] {
  return activeEquipment(document)
    .map((record) => ({ label: displayName(record, catalog), amount: Number(record[1][property] ?? 0) }))
    .filter((part) => part.amount !== 0);
}

function currentValue(document: SaveDocument, key: string): number | null {
  const value = characterMap(document)[key];
  return typeof value === "number" ? value : null;
}

export function healthBreakdown(document: SaveDocument, catalog: Catalog): VitalBreakdown {
  const vitality = Number(characterMap(document).Vitality ?? 0);
  const reached = VITALITY_THRESHOLDS.filter((threshold) => vitality >= threshold);
  const parts: VitalPart[] = [{ label: "Base", amount: BASE_HEALTH }];
  if (reached.length) {
    parts.push({ label: `Vitality thresholds (${reached.join(", ")})`, amount: reached.length * HEALTH_PER_THRESHOLD });
  }
  parts.push(...statPart(document, catalog, "max_hp"));
  return { total: parts.reduce((sum, part) => sum + part.amount, 0), current: currentValue(document, "HP"), parts };
}

export function energyBreakdown(document: SaveDocument, catalog: Catalog): VitalBreakdown {
  const vitality = Number(characterMap(document).Vitality ?? 0);
  const parts: VitalPart[] = [
    { label: "Base", amount: BASE_ENERGY },
    { label: `Vitality ${vitality} × ${ENERGY_PER_VITALITY}`, amount: vitality * ENERGY_PER_VITALITY },
    ...statPart(document, catalog, "MP"),
  ];
  return { total: parts.reduce((sum, part) => sum + part.amount, 0), current: currentValue(document, "MP"), parts };
}
