# UX ideals for the admin UI

How the admin app (`apps/admin-frontend`) is meant to be built, so the next change lands in the
same shape as the last one. Two adjacent docs this isn't:

- The visual rules — text sizes, heading case, spacing, borders, dialogs — live in
  [`.claude/skills/kumo-design/SKILL.md`](../.claude/skills/kumo-design/SKILL.md). That file is
  the authority; nothing here restates it.
- Project layout and deployment are in [`README.md`](../README.md) and
  [`DEPLOYMENT.md`](../DEPLOYMENT.md).

The short version: this is a Cloudflare dashboard, so it should behave like one.

## 1. The shell

```
┌──────────────┬─────────────────────────────────────────────┐
│ 🔗 CF Short…  │ ▤  Links › /promo   …        ☾   ⊙ account │  ← top bar
├──────────────┼─────────────────────────────────────────────┤
│ nav          │  page header + actions                      │
│              │  content (max 1180px, centered)             │
└──────────────┴─────────────────────────────────────────────┘
```

**Top right belongs to the person, not the page.** Identity and account-level controls sit in the
top bar's right cluster — today the theme toggle and the user menu (`src/components/TopBar.tsx`,
`src/components/UserMenu.tsx`). Anything about *the current page* — "New link", the analytics
window selector — goes in `PageHeader`'s `actions` slot instead, never up here.

**The left rail is product navigation and nothing else.** No identity, no logout, no settings
gear. It has two modes; see §2.

**Location is stated once.** The breadcrumb in the top bar names the link you're inside; a page
header below it names the *section* ("General", "Analytics"), not the link again. Pages don't
carry their own "← back" links — the sidebar's back row and the breadcrumb both do that job.

## 2. Sidebar

Two surfaces, swapped with `Sidebar.SlidingViews` (the same primitive the Cloudflare dashboard
uses for account ↔ zone), driven by the URL in `useSurface()` in `src/App.tsx`:

| surface | when | contents |
| --- | --- | --- |
| `app` | everywhere else | Links, Stats, and the owner-only pages |
| `link` | `/links/:slug/*`, `/links/new` | ← All links, the slug, then the link's subpages |

**The collapsed rail holds icons only.** Collapsing (`collapsible="icon"`) leaves roughly one
icon of width and clips whatever is in the header — which is how "CF Shortlinks" used to render
as "CF Sho". So the wordmark is *dropped* when `useSidebar().state === 'collapsed'`, not
truncated, and the `BrandMark` chain-link glyph carries the brand on its own. Anything added to
the header has to survive the same test.

**Adding a link subpage is one array entry and one route.** Append to `LINK_NAV` in `src/App.tsx`
and add the matching `/links/:slug/<key>` route in `src/router.tsx`. Set `newLink: true` only if
the page means something before the link exists.

## 3. Settings are pages, not dialogs

Link editing lives at `/links/:slug/edit` and its siblings, not in a modal. A dialog is a dead
end: it can't be linked to, it can't grow a second section, and it can't hold a page's worth of
settings without becoming a scrolling box.

- **Pages** for anything a person configures: `/links/:slug/edit` (General),
  `/links/:slug/security`, `/links/:slug/analytics`.
- **Dialogs** only for confirmations — "delete this?" — and always mounted, per the Kumo
  `dialog-rendering` rule. `ConfirmButton` already does this correctly; reuse it.
- **Every URL is real.** Deep links survive a hard refresh (the Worker serves the SPA fallback),
  and paths that move keep a redirect: `/links/:slug/stats` still lands on `analytics`.
- **A slug rename moves the URL.** The slug is the page's identity, so saving a new one navigates
  (see `LinkEditView`); otherwise the next reload 404s.
- Settings columns cap at `44rem` (`.settings-column`). Lists and dashboards keep the full
  `1180px`.

## 4. Working inside Kumo's prebuilt stylesheet

This repo has **no Tailwind config**. All CSS arrives prebuilt in
`@cloudflare/kumo/styles/standalone`, which only emits the utilities Kumo itself uses. A class
Kumo happens not to use — `px-5`, `mt-3`, `sm:grid-cols-2`, `hover:underline`, or any arbitrary
value like `text-[0.9em]` — compiles to nothing and fails **silently**: the markup looks right
and the padding simply isn't there.

So:

- Prefer a class already used elsewhere in `src/`, or check it exists:
  `grep -F '.my-class' node_modules/.pnpm/@cloudflare+kumo@*/node_modules/@cloudflare/kumo/dist/styles/kumo-standalone.css`
- If it isn't there, add a named rule to `src/styles.css` — `.card-body`, `.settings-column`,
  `.form-row`, `.mono-inline`, `.hover-underline` are all there for exactly this reason — rather
  than hoping a Tailwind class works.
- Colors come from Kumo's semantic tokens (`bg-kumo-canvas`, `text-kumo-subtle`,
  `ring ring-kumo-line`), never hex literals. The one exception is the Cloudflare orange in
  `TimeSeriesChart.tsx`, which ECharts needs as a value.

## 5. Theme

Binary light/dark, stored in `localStorage['admin-theme']` and applied by setting
`data-mode` on `<html>` (Kumo keys its dark palette off that attribute).
`applyStoredTheme()` runs in `main.tsx` *before* React mounts so there's no flash. The toggle
itself lives in the top bar with the other account controls.

Naming collision worth knowing: the **Themes** page in the nav configures the *unlock pages* that
password-protected links show visitors. It has nothing to do with the admin UI's light/dark mode.

## 6. Checklist for a UI change

- Does new chrome belong to the person (top bar) or the page (`PageHeader`)?
- Does the sidebar still make sense collapsed, on mobile, and in both surfaces?
- Is the new setting a page rather than a dialog? Is its URL linkable and refresh-safe?
- Do all the classes you used actually exist in Kumo's stylesheet?
- Does it read correctly in dark mode and at a phone width?
