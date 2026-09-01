import { LayerCard } from '@cloudflare/kumo';
import type { ReactNode } from 'react';

/**
 * A padded surface panel. Never nest one inside another (Kumo rule).
 *
 * `flush` drops the padding for content that supplies its own edges — a table
 * that runs to the card's border, say.
 */
export function Card({
  children,
  className,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <LayerCard className={`${flush ? '' : 'card-body'} ${className ?? ''}`}>{children}</LayerCard>
  );
}
