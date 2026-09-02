import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSave } from "../codec/save";
import { readLearnedSkills, setSkillLearned } from "./skills";

const realSave = new Uint8Array(readFileSync(new URL("../../../test/character_1/save_2/data.sav", import.meta.url)));
const freshSave = new Uint8Array(readFileSync(new URL("../../../test/character_1/save_1/data.sav", import.meta.url)));

describe("skills", () => {
  it("reads learned flags whether stored as numbers or booleans", async () => {
    const hilda = readLearnedSkills((await decodeSave(realSave)).document);
    expect(hilda.size).toBe(232);
    expect(Array.from(hilda.values()).filter(Boolean)).toHaveLength(13);
    expect(hilda.get("o_skill_piercing_lunge_ico")).toBe(true);
    const arna = readLearnedSkills((await decodeSave(freshSave)).document);
    expect(Array.from(arna.values()).filter(Boolean)).toHaveLength(5);
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

    const numeric = await decodeSave(realSave);
    const off = setSkillLearned(numeric.document, "o_skill_piercing_lunge_ico", false);
    const offList = (off.skillsDataMap as { skillsAllDataList: unknown[] }).skillsAllDataList;
    expect(offList[offList.indexOf("o_skill_piercing_lunge_ico") + 1]).toBe(0);
    expect(() => setSkillLearned(off, "o_skill_not_a_skill", true)).toThrow(/not in this save/);
  });
});
