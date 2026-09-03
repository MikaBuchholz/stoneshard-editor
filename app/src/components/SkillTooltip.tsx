import type { DescriptionRun, SkillCatalogEntry } from "../model/skills";

export interface SkillTooltipState {
  skill: SkillCatalogEntry;
  /** Save id, or null when the skill is not in this save. Learned state is read fresh on every render. */
  id: string | null;
  x: number;
  y: number;
}

/** Hover card for a skill: what it does, what it costs, and what it scales with. */
export function SkillTooltip({ state, learned }: { state: SkillTooltipState; learned: boolean | null }) {
  const { skill } = state;
  const info = skill.info;
  const kind = info?.type ? capitalize(info.type) : skill.kind === "passive" ? "Passive" : "Active";
  const facts: [string, string][] = [];
  if (info?.range) facts.push(["Range", info.range]);
  if (info?.armorPen && info.armorPen !== "0") facts.push(["Armor penetration", `${info.armorPen}%`]);
  if (info?.backfireChance) facts.push(["Backfire chance", `${info.backfireChance}%`]);

  const width = 340;
  const left = Math.min(state.x + 16, window.innerWidth - width - 8);
  const top = Math.min(state.y + 16, window.innerHeight - 40);
  return (
    <div
      className="tooltip skill-tooltip"
      style={{ left, top, width, transform: top > window.innerHeight * 0.6 ? "translateY(-100%)" : undefined }}
    >
      <div className="skill-tooltip-head">
        <span className="tooltip-title">{skill.name}</span>
        {(info?.energy || info?.cooldown) && (
          <span className="skill-cost">
            {info.energy && <span title="Energy cost">{info.energy} ⚡</span>}
            {info.cooldown && <span title="Cooldown in turns">{info.cooldown} ⌛</span>}
          </span>
        )}
      </div>
      <div className="skill-kind">
        {kind}
        {info?.target ? ` · ${info.target}` : ""}
        {learned !== null && <span className={learned ? "tooltip-flag equipped" : "muted"}>{learned ? "learned" : "not learned"}</span>}
      </div>
      {info?.description?.map((paragraph, index) => (
        <p key={index} className="skill-text">
          {runs(paragraph)}
        </p>
      ))}
      {!info?.description && <p className="skill-text muted">No description on the wiki for this skill.</p>}
      {facts.length > 0 && (
        <dl>
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {info?.modifiers && <p className="skill-footnote">Scales with {info.modifiers.toLowerCase()}.</p>}
      {info?.requirements && <p className="skill-footnote">{sentence(info.requirements)}</p>}
      {info?.unlock && <p className="skill-footnote">To unlock, {sentence(info.unlock)}</p>}
    </div>
  );
}

/** Render runs and close the sentence, unless the wiki text already ends in punctuation. */
function sentence(paragraph: DescriptionRun[]) {
  const last = paragraph[paragraph.length - 1]?.text.trimEnd() ?? "";
  return (
    <>
      {runs(paragraph)}
      {/[.!?]$/.test(last) ? "" : "."}
    </>
  );
}

function runs(paragraph: DescriptionRun[]) {
  return paragraph.map((run, index) => (
    <span key={index} className={run.tone ? `tone-${run.tone}` : undefined}>
      {run.text}
    </span>
  ));
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
