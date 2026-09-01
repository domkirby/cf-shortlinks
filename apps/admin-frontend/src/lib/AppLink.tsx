import { forwardRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { LinkComponentProps } from '@cloudflare/kumo';

/**
 * Kumo renders every internal link (`Sidebar.MenuButton href`, `Breadcrumbs.Link`,
 * `DropdownMenu.LinkItem`) through whatever component `LinkProvider` supplies.
 * Routing it through React Router keeps the SPA from doing a full page load on
 * nav clicks.
 *
 * Anything that isn't an in-app path — absolute URLs, `/cdn-cgi/access/logout`,
 * links with a `target` — has to stay a real anchor: React Router would try to
 * match those against the app's route table and land on the catch-all.
 */
function isRouterPath(href: string | undefined, target: string | undefined): href is string {
  return Boolean(href) && href!.startsWith('/') && !href!.startsWith('/cdn-cgi') && !target;
}

export const AppLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(function AppLink(
  { href, to, target, ...rest },
  ref,
) {
  const path = href ?? to;
  if (!isRouterPath(path, target)) {
    return <a ref={ref} href={path} target={target} {...rest} />;
  }
  return <RouterLink ref={ref} to={path} {...rest} />;
});
