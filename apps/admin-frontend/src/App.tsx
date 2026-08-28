import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Banner, Button, Link, Loader, Sidebar, Text, Toasty } from '@cloudflare/kumo';
import {
  ChartBar,
  Gear,
  LinkSimple,
  Moon,
  Palette,
  Sun,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react';
import { WhoamiProvider, useWhoami, useIsOwner } from './lib/whoami';
import { ThemeProvider, useTheme } from './lib/theme';
import { appToastManager } from './lib/toast';

const NAV = [
  { key: 'links', label: 'Links', icon: LinkSimple, owner: false },
  { key: 'stats', label: 'Stats', icon: ChartBar, owner: false },
  { key: 'tokens', label: 'Service tokens', icon: Gear, owner: true },
  { key: 'admins', label: 'Admins', icon: UsersThree, owner: true },
  { key: 'themes', label: 'Themes', icon: Palette, owner: true },
] as const;

function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { actor } = useWhoami();
  const isOwner = useIsOwner();
  const { theme, toggle } = useTheme();

  const active = location.pathname.split('/')[1] || 'links';
  const items = NAV.filter((item) => !item.owner || isOwner);
  const identity = actor
    ? actor.type === 'human'
      ? `${actor.email} · ${actor.role}`
      : `service · ${actor.name}`
    : null;

  return (
    <Sidebar>
      <Sidebar.Header>
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <Text variant="heading">CF Shortlinks</Text>
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            icon={theme === 'dark' ? <Sun /> : <Moon />}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggle}
          />
        </div>
      </Sidebar.Header>

      <Sidebar.Content>
        <Sidebar.Group>
          <Sidebar.Menu>
            {items.map((item) => (
              <Sidebar.MenuButton
                key={item.key}
                icon={item.icon}
                tooltip={item.label}
                active={active === item.key}
                className="cursor-pointer"
                onClick={() => navigate(`/${item.key}`)}
              >
                {item.label}
              </Sidebar.MenuButton>
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>

      <Sidebar.Footer>
        {identity ? (
          <div className="grid gap-1 px-2 py-1">
            <Text variant="secondary" size="xs" truncate>
              {identity}
            </Text>
            <Link href="/cdn-cgi/access/logout" variant="inline" className="text-xs">
              Log out
            </Link>
          </div>
        ) : null}
        <Sidebar.Trigger />
      </Sidebar.Footer>
    </Sidebar>
  );
}

function Shell() {
  const { error, loading } = useWhoami();

  return (
    <Sidebar.Provider defaultOpen collapsible="icon" className="min-h-screen w-full">
      <Nav />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-kumo-line px-4 py-2 md:hidden">
          <Sidebar.Trigger />
          <Text variant="heading">CF Shortlinks</Text>
        </div>
        <div className="page">
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
        </div>
      </main>
    </Sidebar.Provider>
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
