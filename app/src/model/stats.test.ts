import { describe, expect, it } from "vitest";
import { compareStats, formatStat, statLabel } from "./stats";
import type { ItemRecord } from "./records";

const gear = (props: Record<string, unknown>): ItemRecord => ["x", props, -4, -4, 0, -4, -4, 1, 0, "o_inv_head"];

describe("stat comparison", () => {
  it("labels and formats stats the way the game shows them", () => {
    expect(statLabel("FMB")).toBe("Fumble");
    expect(statLabel("Slashing_Damage")).toBe("Slashing damage");
    expect(statLabel("Bleeding_Resistance")).toBe("Bleeding resistance");
    expect(statLabel("Skills_Energy_Cost")).toBe("Skills energy cost");
    expect(formatStat("DEF", 5)).toBe("5");
    expect(formatStat("Hit_Chance", 7)).toBe("+7%");
    expect(formatStat("FMB", -3)).toBe("-3%");
  });

  it("judges better and worse correctly, including lower-is-better stats", () => {
    const helmet = gear({ DEF: 5, Physical_Resistance: 10, FMB: 2, Skills_Energy_Cost: 5, quality: 1, Duration: 50 });
    const cowl = gear({ DEF: 1, Physical_Resistance: 1, MP_Restoration: 1, Miscast_Chance: -1, quality: 1, Duration: 20 });
    const diff = Object.fromEntries(compareStats(helmet, cowl).map((row) => [row.key, row]));
    expect(diff.DEF).toMatchObject({ before: 1, after: 5, verdict: "better" });
    expect(diff.Physical_Resistance.verdict).toBe("better");
    expect(diff.FMB).toMatchObject({ before: 0, after: 2, verdict: "worse" });
    expect(diff.Skills_Energy_Cost.verdict).toBe("worse");
    expect(diff.MP_Restoration).toMatchObject({ before: 1, after: 0, verdict: "worse" });
    expect(diff.Miscast_Chance).toMatchObject({ before: -1, after: 0, verdict: "worse" });
    expect(diff.quality).toBeUndefined();
    expect(diff.Duration).toBeUndefined();
    expect(compareStats(helmet, null)[0]).toMatchObject({ key: "DEF", before: 0, after: 5, verdict: "better" });
    expect(compareStats(helmet, helmet).every((row) => row.verdict === "same")).toBe(true);
  });
});
