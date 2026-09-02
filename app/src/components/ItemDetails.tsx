import type { Catalog } from "../model/catalog";
import { catalogItemFor, chargesOf, displayName, durabilityOf, stackOf, type ItemRecord } from "../model/records";
import { ItemSprite } from "./ItemSprite";
import { NumberField } from "./NumberField";
import { formatStat, type StatDiff } from "../model/stats";

export interface Comparison {
  slotLabel: string;
  currentName: string | null;
  rows: StatDiff[];
}

interface Props {
  record: ItemRecord;
  catalog: Catalog;
  equipped: boolean;
  /** How this item compares with what is equipped in each slot it could go in. */
  comparisons: Comparison[];
  onUpdate: (update: (record: ItemRecord) => void) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function ItemDetails({ record, catalog, equipped, comparisons, onUpdate, onDuplicate, onRemove }: Props) {
  const item = catalogItemFor(record, catalog);
  const stack = stackOf(record);
  const charges = chargesOf(record);
  const durability = durabilityOf(record);
  const contents = Array.isArray(record[1].lootList) ? (record[1].lootList as unknown[]).length : null;

  return (
    <section className="panel details">
      <h2>{displayName(record, catalog)}</h2>
      <div className="details-head">
        <span className="item-icon large">
          <ItemSprite item={item} fallback="?" />
        </span>
        <div className="muted">
          {item ? `${item.category}${item.subcategory ? ` · ${item.subcategory}` : ""} · ${item.w}×${item.h}` : "Not in catalog"}
          {equipped && <div>Equipped</div>}
          {contents !== null && <div>Container with {contents} items inside, left untouched</div>}
        </div>
      </div>
      {stack !== null && (
        <label className="field">
          <span>Stack</span>
          <NumberField value={stack} min={1} onCommit={(value) => onUpdate((r) => (r[6] = value))} />
        </label>
      )}
      {charges !== null && (
        <label className="field">
          <span>Charges</span>
          <NumberField value={charges} min={0} onCommit={(value) => onUpdate((r) => (r[5] = value))} />
        </label>
      )}
      {durability && (
        <label className="field">
          <span>Durability</span>
          <span className="inline">
            <NumberField
              value={Math.round(durability.current * 10) / 10}
              min={0}
              max={durability.max}
              integer={false}
              onCommit={(value) => onUpdate((r) => (r[1].Duration = value))}
            />
            <span className="muted">/ {durability.max}</span>
          </span>
        </label>
      )}
      {comparisons.map((comparison) => (
        <div key={comparison.slotLabel} className="comparison">
          <h3>
            {comparison.slotLabel}: {comparison.currentName ? `compared with ${comparison.currentName}` : "nothing equipped"}
          </h3>
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
      <div className="actions">
        <button type="button" onClick={onDuplicate}>
          Duplicate into bag
        </button>
        <button type="button" className="danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    </section>
  );
}
