import { useMemo, useState } from "react";
import type { SaveDocument } from "../codec/save";
import { readLearnedSkills, setSkillLearned, unlearnAllSkills, type SkillCatalog, type SkillCatalogEntry, type SkillTree } from "../model/skills";
import { characterMap, setCharacterField } from "../model/character";
import { SkillTooltip, type SkillTooltipState } from "./SkillTooltip";

interface Props {
  document: SaveDocument;
  skills: SkillCatalog;
  onChange: (next: SaveDocument) => void;
}

/** Skill trees drawn with the game's own panels; click an icon to learn or unlearn it. */
export function SkillsPanel({ document, skills, onChange }: Props) {
  const learned = useMemo(() => readLearnedSkills(document), [document]);
  const [treeName, setTreeName] = useState(skills.trees[0]?.name ?? "");
  const [tooltip, setTooltip] = useState<SkillTooltipState | null>(null);
  const tree = skills.trees.find((entry) => entry.name === treeName) ?? skills.trees[0];
  const groups = useMemo(() => {
    const map = new Map<string, SkillTree[]>();
    for (const entry of skills.trees) map.set(entry.group, [...(map.get(entry.group) ?? []), entry]);
    return Array.from(map.entries());
  }, [skills]);

  const learnedCount = Array.from(learned.values()).filter(Boolean).length;

  function hoverHandlers(skill: SkillCatalogEntry | undefined, id: string | null) {
    if (!skill) return {};
    const state = (event: { clientX: number; clientY: number }) => ({ skill, id, x: event.clientX, y: event.clientY });
    return {
      onPointerEnter: (event: React.PointerEvent) => setTooltip(state(event)),
      onPointerMove: (event: React.PointerEvent) => setTooltip(state(event)),
      onPointerLeave: () => setTooltip(null),
    };
  }

  /** Unlearn everything and hand the points back. Ability points live in the save's SP field. */
  function resetSkills() {
    const { document: cleared, count } = unlearnAllSkills(document);
    const points = Number(characterMap(document).SP ?? 0);
    onChange(setCharacterField(cleared, "SP", points + count));
  }

  function toggle(id: string) {
    try {
      onChange(setSkillLearned(document, id, !learned.get(id)));
    } catch {
      /* skill not in this save: the icon is drawn but cannot be toggled */
    }
  }

  return (
    <section className="panel skills">
      <div className="bag-header">
        <h2>Skills</h2>
        <span className="muted">{learnedCount} learned</span>
        <button
          type="button"
          disabled={learnedCount === 0}
          onClick={resetSkills}
          title="Unlearn every skill and add the same number of ability points"
        >
          Refund all {learnedCount > 0 ? learnedCount : ""}
        </button>
      </div>
      <div className="tree-tabs">
        {groups.map(([group, trees]) => (
          <div key={group} className="tree-group">
            <span className="tree-group-name">{group}</span>
            {trees.map((entry) => {
              const known = entry.icons.filter((icon) => icon.skillId && learned.get(icon.skillId)).length;
              return (
                <button type="button" key={entry.name} className={entry.name === tree?.name ? "tab active" : "tab"} onClick={() => setTreeName(entry.name)}>
                  {entry.name}
                  {known > 0 && <span className="tab-count">{known}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {tree && (
        <div className="tree" style={{ width: tree.width, height: tree.height, backgroundImage: `url(${import.meta.env.BASE_URL}trees/${tree.image})` }}>
          {tree.icons.map((icon) => {
            const known = icon.skillId ? learned.has(icon.skillId) : false;
            const isLearned = icon.skillId ? learned.get(icon.skillId) === true : false;
            const skill = icon.skillId ? skills.byId.get(icon.skillId) : undefined;
            return (
              <button
                type="button"
                key={`${icon.x},${icon.y}`}
                className={["skill-hotspot", isLearned ? "learned" : "unlearned", known ? "" : "unknown"].join(" ")}
                style={{ left: icon.x, top: icon.y, width: icon.size, height: icon.size }}
                aria-label={skill?.name ?? icon.name}
                {...hoverHandlers(skill, icon.skillId)}
                disabled={!known}
                onClick={() => icon.skillId && toggle(icon.skillId)}
              />
            );
          })}
        </div>
      )}
      <p className="hint">
        Hover a skill to read it, click to learn or unlearn it. Dimmed icons are not learned. Learning here does not spend
        ability points or check prerequisites; the game may expect the lower tiers to be learned first. Refunding hands back
        one ability point per skill, including any your class started with for free.
      </p>
      {tooltip && (
        <SkillTooltip state={tooltip} learned={tooltip.id && learned.has(tooltip.id) ? learned.get(tooltip.id) === true : null} />
      )}
    </section>
  );
}
