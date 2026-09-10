import type { CatalogItem } from "../model/catalog";
import { spriteUrl } from "../model/catalog";

interface Props {
  item: CatalogItem | undefined;
  fallback: string;
  /** Fetch only when scrolled into view: for long lists where most rows start off screen. */
  lazy?: boolean;
}

export function ItemSprite({ item, fallback, lazy }: Props) {
  const url = spriteUrl(item);
  if (!url) return <span className="sprite-fallback">{fallback}</span>;
  return <img className="sprite" src={url} alt="" draggable={false} loading={lazy ? "lazy" : undefined} decoding="async" />;
}
