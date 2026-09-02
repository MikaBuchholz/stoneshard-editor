import type { Catalog } from "../model/catalog";
import { EQUIPMENT_SLOTS } from "../model/inventory";
import { catalogItemFor, chargesOf, displayName, durabilityOf, stackOf, wasAddedHere, type ItemRecord } from "../model/records";
import { formatStat, statLabel, statsOf } from "../model/stats";
import type { Comparison } from "./ItemDetails";

export interface TooltipState {
  record: ItemRecord;
  x: number;
  y: number;
}

/** Hover card for an item: what it is, its condition, and whether it came from this editor. */
export function ItemTooltip({ state, catalog, comparisons }: { state: TooltipState; catalog: Catalog; comparisons: Comparison[] }) {
  const { record } = state;
  const item = catalogItemFor(record, catalog);
  const stack = stackOf(record);
  const charges = chargesOf(record);
  const durability = durabilityOf(record);
  const slot = EQUIPMENT_SLOTS.find((entry) => entry.slot === record[9]);
  const props = record[1];
  const rows: [string, string][] = [];
  if (item) rows.push(["Type", `${item.category}${item.subcategory ? ` · ${item.subcategory}` : ""} · ${item.w}×${item.h}`]);
  if (typeof props.rarity === "string" && props.rarity !== "Common") rows.push(["Rarity", props.rarity]);
  if (typeof props.quality === "number" && props.quality > 1) rows.push(["Quality", String(props.quality)]);
  if (durability) rows.push(["Durability", `${Math.round(durability.current)} / ${durability.max}`]);
  if (stack !== null) rows.push(["Stack", String(stack)]);
  if (charges !== null && charges > 0) rows.push(["Charges", String(charges)]);
  if (typeof props.Fresh === "number") rows.push(["Freshness", String(props.Fresh)]);
  if (Array.isArray(props.lootList)) rows.push(["Contains", `${props.lootList.length} items`]);
  if (props.is_cursed === 1) rows.push(["Cursed", "yes"]);
  if (props.identified === 0) rows.push(["Identified", "no"]);
  if (comparisons.length === 0) {
    for (const [key, value] of Object.entries(statsOf(record))) {
      if (value !== 0 && key !== "DMG") rows.push([statLabel(key), formatStat(key, value)]);
    }
    if (typeof props.DMG === "number" && props.DMG > 0) rows.unshift(["Damage", `${props.DMG}${typeof props.DamageType === "string" ? ` ${props.DamageType.replace("_Damage", "").toLowerCase()}` : ""}`]);
  }
  if (item?.price) rows.push(["Base price", String(item.price)]);

  const width = comparisons.length ? 320 : 260;
  const left = Math.min(state.x + 16, window.innerWidth - width - 8);
  const top = Math.min(state.y + 16, window.innerHeight - 40);
  return (
    <div className="tooltip" style={{ left, top, width, transform: top > window.innerHeight * 0.66 ? "translateY(-100%)" : undefined }}>
      <div className="tooltip-title">{displayName(record, catalog)}</div>
      {slot && <div className="tooltip-flag equipped">Equipped · {slot.label}</div>}
      {wasAddedHere(record) && <div className="tooltip-flag added">Added in this editor</div>}
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {comparisons.map((comparison) => (
        <div key={comparison.slotLabel} className="comparison">
          <h3>{comparison.currentName ? `vs ${comparison.currentName}` : `${comparison.slotLabel}: nothing equipped`}</h3>
          <table>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.key} className={row.verdict}>
                  <th>{row.label}</th>
                  <td>{comparison.currentName ? formatStat(row.key, row.before) : ""}</td>
                  <td className="arrow">{row.verdict === "same" ? "=" : row.verdict === "better" ? "▲" : "▼"}</td>
                  <td>{formatStat(row.key, row.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
