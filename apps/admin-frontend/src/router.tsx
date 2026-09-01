import { createBrowserRouter, Navigate } from 'react-router-dom';
import { App } from './App';
import { RequireOwner } from './lib/RequireOwner';

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/links" replace /> },
      {
        path: '/links',
        lazy: () => import('./views/LinksView').then((m) => ({ Component: m.LinksView })),
      },
      {
        path: '/links/new',
        lazy: () => import('./views/LinkNewView').then((m) => ({ Component: m.LinkNewView })),
      },
      {
        path: '/links/:slug/edit',
        lazy: () => import('./views/LinkEditView').then((m) => ({ Component: m.LinkEditView })),
      },
      {
        path: '/links/:slug/security',
        lazy: () =>
          import('./views/LinkSecurityView').then((m) => ({ Component: m.LinkSecurityView })),
      },
      {
        path: '/links/:slug/analytics',
        lazy: () => import('./views/LinkStatsView').then((m) => ({ Component: m.LinkStatsView })),
      },
      // Analytics used to live at /stats, and a link's own page had no route at
      // all. Both are worth keeping bookmarkable.
      // `relative="path"` resolves against the URL, not the (flat) route tree,
      // so `..` here means the link, not the layout route.
      {
        path: '/links/:slug/stats',
        element: <Navigate to="../analytics" relative="path" replace />,
      },
      { path: '/links/:slug', element: <Navigate to="edit" relative="path" replace /> },
      {
        path: '/stats',
        lazy: () => import('./views/StatsView').then((m) => ({ Component: m.StatsView })),
      },
      {
        path: '/tokens',
        lazy: () =>
          import('./views/TokensView').then((m) => ({
            Component: () => (
              <RequireOwner>
                <m.TokensView />
              </RequireOwner>
            ),
          })),
      },
      {
        path: '/admins',
        lazy: () =>
          import('./views/AdminsView').then((m) => ({
            Component: () => (
              <RequireOwner>
                <m.AdminsView />
              </RequireOwner>
            ),
          })),
      },
      {
        path: '/themes',
        lazy: () =>
          import('./views/ThemesView').then((m) => ({
            Component: () => (
              <RequireOwner>
                <m.ThemesView />
              </RequireOwner>
            ),
          })),
      },
      { path: '*', element: <Navigate to="/links" replace /> },
    ],
  },
]);
