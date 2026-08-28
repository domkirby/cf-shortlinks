import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Banner, Button, Loader, Sidebar, Text, Toasty } from '@cloudflare/kumo';
import {
  ChartBar,
  Gear,
  LinkSimple,
  Moon,
  Palette,
  SignOut,
  Sun,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react';
import { WhoamiProvider, useWhoami, useIsOwner } from './lib/whoami';
import { ThemeProvider, useTheme } from './lib/theme';
import { appToastManager } from './lib/toast';

const LOGOUT_URL = '/cdn-cgi/access/logout';

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
        <div className="flex w-full items-center justify-between gap-2 px-1">
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

        <Sidebar.Group className="mt-auto">
          {identity ? <Sidebar.GroupLabel>{identity}</Sidebar.GroupLabel> : null}
          <Sidebar.Menu>
            <Sidebar.MenuButton icon={SignOut} tooltip="Log out" href={LOGOUT_URL}>
              Log out
            </Sidebar.MenuButton>
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>

      <Sidebar.Footer>
        <Sidebar.Trigger />
      </Sidebar.Footer>
    </Sidebar>
  );
}

function Shell() {
  const { error, loading } = useWhoami();

  return (
    <Sidebar.Provider defaultOpen collapsible="icon" className="h-full w-full">
      <Nav />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-kumo-line px-4 py-2 md:hidden">
          <Sidebar.Trigger />
          <Text variant="heading">CF Shortlinks</Text>
        </div>
        <div className="page">
          {error ? (
            <Banner
              variant="error"
              icon={<WarningCircle weight="fill" />}
              title="Couldn't load your session"
              description={`${error}. Your Cloudflare Access session may have expired — reload to sign in again.`}
              action={
                <Banner.Action onClick={() => window.location.reload()}>Reload</Banner.Action>
              }
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
