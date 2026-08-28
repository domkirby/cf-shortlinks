import { LayerCard } from '@cloudflare/kumo';
import type { ReactNode } from 'react';

/** A padded surface panel. Never nest one inside another (Kumo rule). */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <LayerCard className={`px-5 py-4 ${className ?? ''}`}>{children}</LayerCard>;
}
