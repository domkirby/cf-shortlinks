import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Banner, Button, Link, Loader, Tabs, Text, Toasty } from '@cloudflare/kumo';
import { Moon, Sun, WarningCircle } from '@phosphor-icons/react';
import { WhoamiProvider, useWhoami, useIsOwner } from './lib/whoami';
import { ThemeProvider, useTheme } from './lib/theme';
import { appToastManager } from './lib/toast';

function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { actor } = useWhoami();
  const isOwner = useIsOwner();
  const { theme, toggle } = useTheme();
  const identity = actor
    ? actor.type === 'human'
      ? `${actor.email} · ${actor.role}`
      : `service · ${actor.name}`
    : null;

  const tabs = [
    { value: 'links', label: 'Links' },
    { value: 'stats', label: 'Stats' },
    ...(isOwner
      ? [
          { value: 'tokens', label: 'Service tokens' },
          { value: 'admins', label: 'Admins' },
          { value: 'themes', label: 'Themes' },
        ]
      : []),
  ];
  const active = location.pathname.split('/')[1] || 'links';

  return (
    <header className="sticky top-0 z-10 border-b border-kumo-line bg-kumo-base">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        <span className="shrink-0">
          <Text variant="heading">CF Shortlinks</Text>
        </span>
        <nav className="min-w-0 flex-1 overflow-x-auto">
          <Tabs
            variant="underline"
            tabs={tabs}
            value={tabs.some((t) => t.value === active) ? active : 'links'}
            onValueChange={(v) => navigate(`/${v}`)}
          />
        </nav>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            shape="square"
            icon={theme === 'dark' ? <Sun /> : <Moon />}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggle}
          />
          {identity ? (
            <span className="text-sm text-kumo-subtle">
              {identity}{' '}
              <Link href="/cdn-cgi/access/logout" variant="inline">
                Log out
              </Link>
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function Shell() {
  const { error, loading } = useWhoami();

  return (
    <>
      <TopBar />
      <main className="page">
        {error ? (
          <Banner
            variant="error"
            icon={<WarningCircle weight="fill" />}
            title="Admin API unavailable"
            description={error}
          />
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader />
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <Toasty toastManager={appToastManager}>
        <WhoamiProvider>
          <Shell />
        </WhoamiProvider>
      </Toasty>
    </ThemeProvider>
  );
}
