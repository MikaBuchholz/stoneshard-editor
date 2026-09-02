import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSave, type SaveDocument } from "../codec/save";
import { readLearnedSkills, setSkillLearned } from "./skills";

const freshSave = new Uint8Array(readFileSync(new URL("../../fixtures/character_1/save_1/data.sav", import.meta.url)));

/** Some saves store the learned flag as a number instead of a boolean; both must round-trip. */
function withNumericFlags(document: SaveDocument): SaveDocument {
  const map = document.skillsDataMap as { skillsAllDataList: unknown[] };
  const list = map.skillsAllDataList.map((value, index) => (index % 5 === 1 ? (value === true ? 1 : 0) : value));
  return { ...document, skillsDataMap: { ...map, skillsAllDataList: list } };
}

describe("skills", () => {
  it("reads learned flags whether stored as numbers or booleans", async () => {
    const { document } = await decodeSave(freshSave);
    const boolean = readLearnedSkills(document);
    expect(boolean.size).toBe(232);
    expect(Array.from(boolean.values()).filter(Boolean)).toHaveLength(5);
    expect(boolean.get("o_skill_piercing_lunge_ico")).toBe(false);
    const numeric = readLearnedSkills(withNumericFlags(document));
    expect(numeric).toEqual(boolean);
  });

  it("toggles a skill keeping the stored value type", async () => {
    const { document } = await decodeSave(freshSave);
    const list = (document.skillsDataMap as { skillsAllDataList: unknown[] }).skillsAllDataList;
    const index = list.indexOf("o_skill_piercing_lunge_ico");
    expect(list[index + 1]).toBe(false);
    const next = setSkillLearned(document, "o_skill_piercing_lunge_ico", true);
    const nextList = (next.skillsDataMap as { skillsAllDataList: unknown[] }).skillsAllDataList;
    expect(nextList[index + 1]).toBe(true);
    expect(readLearnedSkills(next).get("o_skill_piercing_lunge_ico")).toBe(true);
    expect(list[index + 1]).toBe(false);

    const numeric = withNumericFlags(setSkillLearned(document, "o_skill_piercing_lunge_ico", true));
    expect(readLearnedSkills(numeric).get("o_skill_piercing_lunge_ico")).toBe(true);
    const off = setSkillLearned(numeric, "o_skill_piercing_lunge_ico", false);
    const offList = (off.skillsDataMap as { skillsAllDataList: unknown[] }).skillsAllDataList;
    expect(offList[offList.indexOf("o_skill_piercing_lunge_ico") + 1]).toBe(0);
    expect(() => setSkillLearned(off, "o_skill_not_a_skill", true)).toThrow(/not in this save/);
  });
});
