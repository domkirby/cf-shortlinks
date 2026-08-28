import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '@cloudflare/kumo/styles/standalone';
import './styles.css';
import { router } from './router';
import { applyStoredTheme } from './lib/theme';

// Set the theme before the first paint so there's no light-mode flash.
applyStoredTheme();

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
