import { useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Banner, LinkProvider, Loader, Sidebar, Text, Toasty, useSidebar } from '@cloudflare/kumo';
import {
  ArrowLeft,
  ChartBar,
  Gear,
  LinkSimple,
  Lock,
  Palette,
  SlidersHorizontal,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react';
import { WhoamiProvider, useWhoami, useIsOwner } from './lib/whoami';
import { ThemeProvider } from './lib/theme';
import { appToastManager } from './lib/toast';
import { AppLink } from './lib/AppLink';
import { BrandMark } from './components/BrandMark';
import { TopBar } from './components/TopBar';

const NAV = [
  { key: 'links', label: 'Links', icon: LinkSimple, owner: false },
  { key: 'stats', label: 'Stats', icon: ChartBar, owner: false },
  { key: 'tokens', label: 'Service tokens', icon: Gear, owner: true },
  { key: 'admins', label: 'Admins', icon: UsersThree, owner: true },
  { key: 'themes', label: 'Themes', icon: Palette, owner: true },
] as const;

/**
 * Subpages of a single link. Adding a settings page is one entry here plus one
 * route — that's the whole point of drilling in rather than opening a dialog.
 * `newLink` marks the ones that mean anything before the link exists.
 */
const LINK_NAV = [
  { key: 'edit', label: 'General', icon: SlidersHorizontal, newLink: true },
  { key: 'security', label: 'Security', icon: Lock, newLink: false },
  { key: 'analytics', label: 'Analytics', icon: ChartBar, newLink: false },
] as const;

interface Surface {
  /** Which sliding view the sidebar is showing. */
  key: 'app' | 'link';
  /** Slug being edited, or null on `/links/new` (and everywhere in `app`). */
  slug: string | null;
  isNew: boolean;
}

/** Derives the sidebar surface from the URL, e.g. `/links/promo/security`. */
function useSurface(): Surface {
  const segments = useLocation().pathname.split('/').filter(Boolean);
  if (segments[0] !== 'links' || !segments[1]) return { key: 'app', slug: null, isNew: false };
  if (segments[1] === 'new') return { key: 'link', slug: null, isNew: true };
  return { key: 'link', slug: decodeURIComponent(segments[1]), isNew: false };
}

function Brand() {
  // The collapsed rail is icon-width; anything textual in it gets clipped
  // mid-word, so the wordmark is dropped rather than truncated.
  const { state } = useSidebar();
  return (
    <div className="flex min-w-0 items-center gap-2 px-1">
      <BrandMark />
      {state === 'collapsed' ? null : <Text variant="heading">CF Shortlinks</Text>}
    </div>
  );
}

function AppNav() {
  const location = useLocation();
  const isOwner = useIsOwner();
  const active = location.pathname.split('/')[1] || 'links';

  return (
    <Sidebar.Content>
      <Sidebar.Group>
        <Sidebar.Menu>
          {NAV.filter((item) => !item.owner || isOwner).map((item) => (
            <Sidebar.MenuButton
              key={item.key}
              icon={item.icon}
              tooltip={item.label}
              active={active === item.key}
              href={`/${item.key}`}
            >
              {item.label}
            </Sidebar.MenuButton>
          ))}
        </Sidebar.Menu>
      </Sidebar.Group>
    </Sidebar.Content>
  );
}

function LinkNav({ slug, isNew }: { slug: string | null; isNew: boolean }) {
  const location = useLocation();
  const section = location.pathname.split('/')[3] ?? '';
  const base = slug ? `/links/${encodeURIComponent(slug)}` : '/links/new';
  const items = LINK_NAV.filter((item) => !isNew || item.newLink);

  return (
    <Sidebar.Content>
      <Sidebar.Group>
        <Sidebar.Menu>
          <Sidebar.MenuButton icon={ArrowLeft} tooltip="All links" href="/links">
            All links
          </Sidebar.MenuButton>
        </Sidebar.Menu>
        <Sidebar.GroupLabel>
          <span className="mono-inline">{isNew ? 'New link' : `/${slug}`}</span>
        </Sidebar.GroupLabel>
        <Sidebar.Menu>
          {items.map((item) => (
            <Sidebar.MenuButton
              key={item.key}
              icon={item.icon}
              tooltip={item.label}
              active={isNew ? item.key === 'edit' : section === item.key}
              href={isNew ? '/links/new' : `${base}/${item.key}`}
            >
              {item.label}
            </Sidebar.MenuButton>
          ))}
        </Sidebar.Menu>
      </Sidebar.Group>
    </Sidebar.Content>
  );
}

function Nav({ surface }: { surface: Surface }) {
  // Both views stay mounted so the slide animation has something to slide to;
  // the link view keeps its last slug on the way out.
  const lastLink = useRef({ slug: null as string | null, isNew: false });
  if (surface.key === 'link') lastLink.current = { slug: surface.slug, isNew: surface.isNew };

  return (
    <Sidebar>
      <Sidebar.Header>
        <Brand />
      </Sidebar.Header>

      <Sidebar.SlidingViews
        activeKey={surface.key}
        direction={surface.key === 'link' ? 'left' : 'right'}
      >
        <Sidebar.SlidingView value="app">
          <AppNav />
        </Sidebar.SlidingView>
        <Sidebar.SlidingView value="link">
          <LinkNav slug={lastLink.current.slug} isNew={lastLink.current.isNew} />
        </Sidebar.SlidingView>
      </Sidebar.SlidingViews>

      <Sidebar.Footer>
        <Sidebar.Trigger />
      </Sidebar.Footer>
    </Sidebar>
  );
}

function Shell() {
  const { error, loading } = useWhoami();
  const surface = useSurface();

  return (
    <Sidebar.Provider defaultOpen collapsible="icon" className="h-full w-full">
      <Nav surface={surface} />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <TopBar slug={surface.slug} isNew={surface.isNew} />
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
    <LinkProvider component={AppLink}>
      <ThemeProvider>
        <Toasty toastManager={appToastManager}>
          <WhoamiProvider>
            <Shell />
          </WhoamiProvider>
        </Toasty>
      </ThemeProvider>
    </LinkProvider>
  );
}
