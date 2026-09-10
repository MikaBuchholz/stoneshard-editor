import type { SaveDocument } from "../codec/save";
import { characterMap } from "./character";

/**
 * Skills live in `skillsDataMap.skillsAllDataList`, a flat list of five values per skill:
 * [object name, learned, unused, flag with unknown meaning, unused]. Only the learned flag is edited.
 * The value type (0/1 or false/true) varies between saves, so writes keep whatever type was there.
 */

const STRIDE = 5;

/** One coloured run of a skill description, as the game and the wiki style it. */
export interface DescriptionRun {
  text: string;
  tone?: "strong" | "good" | "bad" | "fire" | "shock" | "arcane" | "energy" | "unholy" | "caustic" | "frost" | "sacred";
}

/** Tooltip data for a skill, taken from the wiki's per-tree skill data pages. */
export interface SkillInfo {
  type?: string;
  target?: string;
  range?: string;
  energy?: string;
  cooldown?: string;
  armorPen?: string;
  backfireChance?: string;
  modifiers?: string;
  /** Single-paragraph fields that carry their own colour markup. */
  requirements?: DescriptionRun[];
  unlock?: DescriptionRun[];
  /** Paragraphs, each a list of runs. */
  description?: DescriptionRun[][];
}

export interface SkillCatalogEntry {
  id: string;
  key: string;
  kind: "active" | "passive";
  name: string;
  icon?: string;
  info?: SkillInfo;
}

export interface TreeIcon {
  name: string;
  x: number;
  y: number;
  size: number;
  skillId: string | null;
  /** The panel image shows this slot as empty, so draw the skill's own icon over it. */
  overlay?: boolean;
}

export interface SkillTree {
  name: string;
  group: string;
  image: string;
  width: number;
  height: number;
  icons: TreeIcon[];
}

export interface SkillCatalog {
  skills: SkillCatalogEntry[];
  trees: SkillTree[];
  byId: Map<string, SkillCatalogEntry>;
}

export async function loadSkillCatalog(): Promise<SkillCatalog> {
  const response = await fetch(`${import.meta.env.BASE_URL}catalog/skills.json`);
  if (!response.ok) throw new Error(`Could not load the skill catalog (${response.status}).`);
  const raw = (await response.json()) as Omit<SkillCatalog, "byId">;
  return { ...raw, byId: new Map(raw.skills.map((skill) => [skill.id, skill])) };
}

function skillList(document: SaveDocument): unknown[] {
  const map = document.skillsDataMap;
  if (!map || typeof map !== "object") throw new Error("This save has no skills section.");
  const list = (map as Record<string, unknown>).skillsAllDataList;
  if (!Array.isArray(list)) throw new Error("This save has no skill list.");
  return list;
}

/** Learned state for every skill id present in the save. */
export function readLearnedSkills(document: SaveDocument): Map<string, boolean> {
  const list = skillList(document);
  const learned = new Map<string, boolean>();
  for (let index = 0; index + STRIDE <= list.length; index += STRIDE) {
    const id = list[index];
    if (typeof id === "string") learned.set(id, truthy(list[index + 1]));
  }
  return learned;
}

export function setSkillLearned(document: SaveDocument, id: string, learned: boolean): SaveDocument {
  const list = [...skillList(document)];
  for (let index = 0; index + STRIDE <= list.length; index += STRIDE) {
    if (list[index] !== id) continue;
    const current = list[index + 1];
    list[index + 1] = typeof current === "boolean" ? learned : learned ? 1 : 0;
    const map = document.skillsDataMap as Record<string, unknown>;
    return { ...document, skillsDataMap: { ...map, skillsAllDataList: list } };
  }
  throw new Error("That skill is not in this save.");
}

/**
 * Skills every character starts with for free: the Basic Skills tree (Examine Surroundings, Element of
 * Surprise, Craft, Set Aflame) plus Butchering, which the wiki lists as unlocked for everyone.
 */
export const BASIC_SKILLS: readonly string[] = [
  "o_skill_trap_search_ico",
  "o_pass_skill_Sudden_Attacks",
  "o_skill_craft_ico",
  "o_skill_torch_strike_ico",
  "o_skill_butchering_ico",
];

/**
 * Extra starting skills a character's trait grants, keyed by the save's classKey and nameKey so either
 * matches. Dirwin's Ranger's Grit gives Make a Halt; Hilda's Wild Hunt gives Resourcefulness.
 */
export const TRAIT_SKILLS: Readonly<Record<string, readonly string[]>> = {
  Beastslayer: ["o_pass_skill_resourcefulness"],
  Hilda: ["o_pass_skill_resourcefulness"],
  Dirwin: ["o_pass_skill_halt"],
};

/** Ids of the skills this character started with, whether or not they are still learned. */
export function startingSkills(document: SaveDocument): Set<string> {
  const character = characterMap(document);
  const ids = new Set(BASIC_SKILLS);
  for (const key of [character.classKey, character.nameKey]) {
    if (typeof key !== "string") continue;
    for (const id of TRAIT_SKILLS[key] ?? []) ids.add(id);
  }
  return ids;
}

/**
 * Unlearn every skill at once, keeping each stored flag's value type. Skills in `keep` stay learned and
 * are not counted; pass the character's starting skills so free abilities are not refunded.
 */
export function unlearnAllSkills(document: SaveDocument, keep: ReadonlySet<string> = new Set()): { document: SaveDocument; count: number } {
  const list = [...skillList(document)];
  let count = 0;
  for (let index = 0; index + STRIDE <= list.length; index += STRIDE) {
    const id = list[index];
    if (typeof id !== "string" || keep.has(id) || !truthy(list[index + 1])) continue;
    const current = list[index + 1];
    list[index + 1] = typeof current === "boolean" ? false : 0;
    count += 1;
  }
  const map = document.skillsDataMap as Record<string, unknown>;
  return { document: { ...document, skillsDataMap: { ...map, skillsAllDataList: list } }, count };
}

function truthy(value: unknown): boolean {
  return value === true || (typeof value === "number" && value > 0);
}
