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
        path: '/links/:slug/stats',
        lazy: () => import('./views/LinkStatsView').then((m) => ({ Component: m.LinkStatsView })),
      },
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
