import { createKumoToastManager } from '@cloudflare/kumo';

/**
 * A module-level manager so any code — not just components — can raise a
 * toast. Passed to the single `<Toasty>` in App.
 */
export const appToastManager = createKumoToastManager();

export function toast(title: string, variant?: 'success' | 'error' | 'info'): void {
  appToastManager.add({ title, variant });
}
