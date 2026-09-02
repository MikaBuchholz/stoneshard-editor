import { useMemo, useState } from "react";
import type { SaveDocument } from "../codec/save";
import { readLearnedSkills, setSkillLearned, type SkillCatalog, type SkillTree } from "../model/skills";

interface Props {
  document: SaveDocument;
  skills: SkillCatalog;
  onChange: (next: SaveDocument) => void;
}

/** Skill trees drawn with the game's own panels; click an icon to learn or unlearn it. */
export function SkillsPanel({ document, skills, onChange }: Props) {
  const learned = useMemo(() => readLearnedSkills(document), [document]);
  const [treeName, setTreeName] = useState(skills.trees[0]?.name ?? "");
  const [query, setQuery] = useState("");
  const tree = skills.trees.find((entry) => entry.name === treeName) ?? skills.trees[0];
  const groups = useMemo(() => {
    const map = new Map<string, SkillTree[]>();
    for (const entry of skills.trees) map.set(entry.group, [...(map.get(entry.group) ?? []), entry]);
    return Array.from(map.entries());
  }, [skills]);

  const learnedCount = Array.from(learned.values()).filter(Boolean).length;

  function toggle(id: string) {
    try {
      onChange(setSkillLearned(document, id, !learned.get(id)));
    } catch {
      /* skill not in this save: the icon is drawn but cannot be toggled */
    }
  }

  const searched = query.trim()
    ? skills.skills.filter((skill) => learned.has(skill.id) && skill.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  return (
    <section className="panel skills">
      <div className="bag-header">
        <h2>Skills</h2>
        <span className="muted">{learnedCount} learned</span>
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
      <div className="skills-body">
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
                  title={`${skill?.name ?? icon.name}${known ? (isLearned ? " · learned" : " · not learned") : " · not in this save"}`}
                  disabled={!known}
                  onClick={() => icon.skillId && toggle(icon.skillId)}
                />
              );
            })}
          </div>
        )}
        {tree && (
          <ul className="skill-list tree-list">
            {tree.icons.map((icon) => {
              const skill = icon.skillId ? skills.byId.get(icon.skillId) : undefined;
              const known = icon.skillId ? learned.has(icon.skillId) : false;
              return (
                <li key={`${icon.x},${icon.y}`}>
                  <label className="field toggle">
                    <input type="checkbox" disabled={!known} checked={known && learned.get(icon.skillId!) === true} onChange={() => icon.skillId && toggle(icon.skillId)} />
                    {skill?.icon ? <img className="skill-icon" src={`${import.meta.env.BASE_URL}skills/${skill.icon}`} alt="" /> : <span className="skill-icon" />}
                    <span>
                      {skill?.name ?? icon.name} <span className="muted">· {skill?.kind ?? "?"}{known ? "" : " · not in this save"}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <input type="search" placeholder="Search all skills" value={query} onChange={(event) => setQuery(event.target.value)} />
      {searched.length > 0 && (
        <ul className="skill-list">
          {searched.slice(0, 40).map((skill) => (
            <li key={skill.id}>
              <label className="field toggle">
                <input type="checkbox" checked={learned.get(skill.id) === true} onChange={() => toggle(skill.id)} />
                {skill.icon ? <img className="skill-icon" src={`${import.meta.env.BASE_URL}skills/${skill.icon}`} alt="" /> : <span className="skill-icon" />}
                <span>
                  {skill.name} <span className="muted">· {skill.kind}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
