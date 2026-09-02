import type { ItemRecord } from "./records";

/** Display names for the stat properties the game puts on equipment records. */
const LABELS: Record<string, string> = {
  DEF: "Defense",
  DMG: "Damage",
  PRR: "Block chance",
  EVS: "Dodge",
  CTA: "Counter chance",
  CRT: "Crit chance",
  CRTD: "Crit efficiency",
  FMB: "Fumble",
  VSN: "Vision",
  MP: "Energy",
  max_hp: "Max health",
  Hit_Chance: "Accuracy",
  Weapon_Damage: "Weapon damage",
  Range: "Range",
  Bonus_Range: "Bonus range",
  Received_XP: "Experience gain",
};

/** Stats where a smaller number is the better one. */
const LOWER_IS_BETTER = new Set(["FMB", "Abilities_Energy_Cost", "Skills_Energy_Cost", "Spells_Energy_Cost", "Miscast_Chance", "Damage_Received", "Fatigue_Gain"]);

/** Flat values; everything else the game shows as a percentage. */
const FLAT = new Set(["DEF", "DMG", "Block_Power", "Range", "Bonus_Range", "MP", "Bodypart_Damage"]);

/** Record properties that are not stats even though they are numbers. */
const NOT_STATS = new Set(["Colour", "Duration", "MaxDuration", "is_cursed", "identified", "charge", "max_charge", "quality", "cursedQuality", "i_index", "Effects_Duration", "Stack", "Fresh", "is_trade_item", "HasOwner", "is_execute", "Timestamp", "is_fire", "Weight"]);

export function isStat(key: string, value: unknown): value is number {
  return typeof value === "number" && !NOT_STATS.has(key) && !/^(Char\d|key)$/.test(key);
}

export function statLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  if (key.endsWith("_Damage")) return `${key.slice(0, -7)} damage`;
  if (key.endsWith("_Resistance")) return `${key.slice(0, -11)} resistance`;
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter, offset) => (offset === 0 ? letter.toUpperCase() : letter.toLowerCase()));
}

export function formatStat(key: string, value: number): string {
  const sign = value > 0 && !FLAT.has(key) && key !== "DEF" ? "+" : "";
  const unit = FLAT.has(key) || key.endsWith("_Damage") ? "" : "%";
  return `${sign}${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
}

export function statsOf(record: ItemRecord): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const [key, value] of Object.entries(record[1])) if (isStat(key, value)) stats[key] = value;
  return stats;
}

export type Verdict = "better" | "worse" | "same";

export interface StatDiff {
  key: string;
  label: string;
  before: number;
  after: number;
  verdict: Verdict;
}

/** Every stat on either record, with how swapping `current` for `candidate` would change it. */
export function compareStats(candidate: ItemRecord, current: ItemRecord | null): StatDiff[] {
  const after = statsOf(candidate);
  const before = current ? statsOf(current) : {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const damageFirst = (key: string) => (key === "DMG" ? 0 : key === "DEF" ? 1 : 2);
  keys.sort((a, b) => damageFirst(a) - damageFirst(b) || statLabel(a).localeCompare(statLabel(b)));
  return keys.map((key) => {
    const from = before[key] ?? 0;
    const to = after[key] ?? 0;
    let verdict: Verdict = "same";
    if (to !== from) verdict = (to > from) !== LOWER_IS_BETTER.has(key) ? "better" : "worse";
    return { key, label: statLabel(key), before: from, after: to, verdict };
  });
}
