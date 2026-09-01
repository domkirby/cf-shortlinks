import { Breadcrumbs, Button, Sidebar } from '@cloudflare/kumo';
import { Moon, Sun } from '@phosphor-icons/react';
import { useTheme } from '../lib/theme';
import { UserMenu } from './UserMenu';

/**
 * The account-level strip: sidebar trigger and location on the left, the
 * controls that belong to the person rather than the page on the right.
 *
 * Page-level actions ("New link", the time-window selector) stay in
 * `PageHeader` — see `docs/ux.md`.
 */
export function TopBar({ slug, isNew }: { slug: string | null; isNew: boolean }) {
  const { theme, toggle } = useTheme();

  return (
    <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-kumo-line bg-kumo-canvas px-3">
      <Sidebar.Trigger />
      {slug || isNew ? (
        <Breadcrumbs size="sm">
          <Breadcrumbs.Link href="/links">Links</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Current>
            {isNew ? 'New link' : <span className="mono-inline">/{slug}</span>}
          </Breadcrumbs.Current>
        </Breadcrumbs>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          shape="square"
          size="sm"
          icon={theme === 'dark' ? <Sun /> : <Moon />}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggle}
        />
        <UserMenu />
      </div>
    </div>
  );
}
