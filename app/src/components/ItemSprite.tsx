import type { CatalogItem } from "../model/catalog";
import { spriteUrl } from "../model/catalog";

interface Props {
  item: CatalogItem | undefined;
  fallback: string;
}

export function ItemSprite({ item, fallback }: Props) {
  const url = spriteUrl(item);
  if (!url) return <span className="sprite-fallback">{fallback}</span>;
  return <img className="sprite" src={url} alt="" draggable={false} />;
}
