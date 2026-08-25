<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { CreateLinkInput, Link, Theme, UpdateLinkInput } from '@domk/shared-types';
import { api, ApiRequestError } from '../api';
import { derivePasswordPayload } from '../pbkdf2';

const links = ref<Link[]>([]);
const themes = ref<Theme[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const editingId = ref<number | null>(null);

const PAGE_SIZE = 25;
const offset = ref(0);
const rangeText = () =>
  total.value === 0 ? 'No links' : `${offset.value + 1}–${offset.value + links.value.length} of ${total.value}`;

const filters = reactive({ q: '', active: '' });
const form = reactive({
  slug: '',
  destination: '',
  expiresAt: '',
  tags: '',
  active: true,
  passwordEnabled: false,
  /** In-memory only — never sent as-is, only the PBKDF2-derived payload is. */
  passwordPlaintext: '',
  themeId: null as number | null,
});

const themeName = (themeId: number | null) => themes.value.find((t) => t.id === themeId)?.name ?? '—';

/** Only the parts that actually apply — an unremarkable link shows nothing. */
function secondaryLine(link: Link): string {
  const parts: string[] = [];
  if (link.tags.length) parts.push(link.tags.join(', '));
  if (link.expiresAt) parts.push(`expires ${formatDate(link.expiresAt)}`);
  if (link.themeId !== null) parts.push(`theme: ${themeName(link.themeId)}`);
  return parts.join(' · ');
}

function reportError(err: unknown): void {
  error.value = err instanceof ApiRequestError ? err.message : String(err);
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const page = await api.listLinks({
      q: filters.q,
      active: filters.active,
      limit: String(PAGE_SIZE),
      offset: String(offset.value),
    });
    links.value = page.items;
    total.value = page.total;
  } catch (err) {
    reportError(err);
  } finally {
    loading.value = false;
  }
}

/** A changed search/filter invalidates the current page position. */
function search(): void {
  offset.value = 0;
  void load();
}

function prevPage(): void {
  offset.value = Math.max(0, offset.value - PAGE_SIZE);
  void load();
}

function nextPage(): void {
  offset.value += PAGE_SIZE;
  void load();
}

async function loadThemes(): Promise<void> {
  try {
    themes.value = (await api.listThemes()).items;
  } catch {
    // Non-fatal: the form still works without theme options, just with none to pick.
  }
}

onMounted(() => {
  void load();
  void loadThemes();
});

function resetForm(): void {
  editingId.value = null;
  Object.assign(form, {
    slug: '',
    destination: '',
    expiresAt: '',
    tags: '',
    active: true,
    passwordEnabled: false,
    passwordPlaintext: '',
    themeId: null,
  });
}

function startEdit(link: Link): void {
  editingId.value = link.id;
  Object.assign(form, {
    slug: link.slug,
    destination: link.destination,
    // <input type="datetime-local"> wants a local ISO string with no zone.
    expiresAt: link.expiresAt ? toLocalInput(link.expiresAt) : '',
    tags: link.tags.join(', '),
    active: link.active,
    // The API never returns the password itself (write-only) — only whether
    // one is set. Leaving the password field blank on save keeps it as-is.
    passwordEnabled: link.passwordProtected,
    passwordPlaintext: '',
    themeId: link.themeId,
  });
}

function toLocalInput(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function submit(): Promise<void> {
  error.value = null;
  notice.value = null;

  const payload: Record<string, unknown> = {
    slug: form.slug.trim() || undefined,
    destination: form.destination.trim(),
    expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : null,
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    active: form.active,
    themeId: form.themeId,
  };

  if (form.passwordEnabled) {
    if (form.passwordPlaintext) {
      payload.passwordVerifier = await derivePasswordPayload(form.passwordPlaintext);
    } else if (!editingId.value) {
      error.value = 'Enter a password to protect a new link.';
      return;
    }
    // else: editing, protection stays on, password left unchanged — omit the field entirely.
  } else if (editingId.value) {
    // Explicitly unchecked on an existing link — clear the stored password.
    payload.passwordVerifier = null;
  }

  try {
    const result = editingId.value
      ? await api.updateLink(editingId.value, payload as unknown as UpdateLinkInput)
      : await api.createLink(payload as unknown as CreateLinkInput);
    notice.value = `Saved ${result.shortUrl}`;
    resetForm();
    await load();
  } catch (err) {
    reportError(err);
  }
}

async function remove(link: Link): Promise<void> {
  if (!confirm(`Delete /${link.slug}? The short link stops working immediately.`)) return;
  error.value = null;
  try {
    await api.deleteLink(link.id);
    if (editingId.value === link.id) resetForm();
    await load();
  } catch (err) {
    reportError(err);
  }
}

async function toggleActive(link: Link): Promise<void> {
  error.value = null;
  try {
    await api.updateLink(link.id, { active: !link.active });
    await load();
  } catch (err) {
    reportError(err);
  }
}

async function copy(shortUrl: string): Promise<void> {
  await navigator.clipboard.writeText(shortUrl);
  notice.value = `Copied ${shortUrl}`;
}

const shortUrlFor = (link: Link) => `https://${import.meta.env.VITE_SHORT_DOMAIN}/${link.slug}`;
const formatDate = (epochMs: number) => new Date(epochMs).toLocaleDateString();
</script>

<template>
  <h1>Links</h1>

  <div v-if="error" class="banner error">{{ error }}</div>
  <div v-if="notice" class="banner ok">{{ notice }}</div>

  <form class="card" @submit.prevent="submit">
    <h2>{{ editingId ? 'Edit link' : 'New link' }}</h2>
    <div class="row">
      <div class="field">
        <label for="slug">Slug</label>
        <input id="slug" v-model="form.slug" placeholder="leave blank to generate" />
      </div>
      <div class="field field--wide">
        <label for="destination">Destination</label>
        <input id="destination" v-model="form.destination" required placeholder="https://…" />
      </div>
    </div>
    <div class="row">
      <div class="field">
        <label for="expires">Expires (optional)</label>
        <input id="expires" v-model="form.expiresAt" type="datetime-local" />
      </div>
      <div class="field">
        <label for="tags">Tags (comma separated)</label>
        <input id="tags" v-model="form.tags" placeholder="work, social" />
      </div>
      <div class="field field--narrow">
        <label for="active">Active</label>
        <input id="active" v-model="form.active" type="checkbox" />
      </div>
    </div>
    <div class="row">
      <div class="field" style="max-width: 200px">
        <label for="password-enabled">Password protect this link</label>
        <input
          id="password-enabled"
          v-model="form.passwordEnabled"
          type="checkbox"
        />
      </div>
      <div class="field" v-if="form.passwordEnabled">
        <label for="password">Password{{ editingId ? ' (leave blank to keep current)' : '' }}</label>
        <input id="password" v-model="form.passwordPlaintext" type="password" placeholder="••••••••" />
      </div>
      <div class="field">
        <label for="theme">Theme (for the unlock page)</label>
        <select id="theme" v-model="form.themeId">
          <option :value="null">Default</option>
          <option v-for="theme in themes" :key="theme.id" :value="theme.id">{{ theme.name }}</option>
        </select>
      </div>
    </div>
    <div class="actions">
      <button type="submit">{{ editingId ? 'Save changes' : 'Create link' }}</button>
      <button v-if="editingId" type="button" class="secondary" @click="resetForm">Cancel</button>
    </div>
  </form>

  <div class="card">
    <div class="row" style="margin-bottom: 12px">
      <input v-model="filters.q" placeholder="Search slug or destination" @keyup.enter="search" />
      <select v-model="filters.active" @change="search">
        <option value="">All</option>
        <option value="true">Active only</option>
        <option value="false">Inactive only</option>
      </select>
      <button class="secondary" style="max-width: 120px" @click="search">Search</button>
    </div>

    <p v-if="loading" class="empty">Loading…</p>
    <p v-else-if="!links.length" class="empty">No links yet.</p>
    <table v-else class="responsive">
      <thead>
        <tr>
          <th>Slug</th>
          <th>Destination</th>
          <th>State</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="link in links" :key="link.id">
          <td class="mono" data-label="Slug">/{{ link.slug }}</td>
          <td data-label="Destination" class="cell-full">
            <a class="truncate mono" :href="link.destination" target="_blank" rel="noopener noreferrer">
              {{ link.destination }}
            </a>
            <div v-if="secondaryLine(link)" class="muted" style="font-size: 12px; margin-top: 2px">
              {{ secondaryLine(link) }}
            </div>
          </td>
          <td data-label="State">
            <span class="pill" :class="link.active ? 'on' : 'off'">
              {{ link.active ? 'active' : 'off' }}
            </span>
            <span v-if="link.passwordProtected" class="pill accent" style="margin-left: 4px">protected</span>
          </td>
          <td class="cell-menu">
            <details class="menu">
              <summary>⋮</summary>
              <div class="menu-items">
                <button type="button" @click="copy(shortUrlFor(link))">Copy short URL</button>
                <button type="button" @click="startEdit(link)">Edit</button>
                <button type="button" @click="toggleActive(link)">
                  {{ link.active ? 'Disable' : 'Enable' }}
                </button>
                <RouterLink :to="`/links/${link.slug}/stats`">Stats</RouterLink>
                <button type="button" class="danger" @click="remove(link)">Delete</button>
              </div>
            </details>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="pagination">
      <p class="muted" style="margin: 0">{{ rangeText() }}</p>
      <div class="actions">
        <button class="secondary" :disabled="offset === 0" @click="prevPage">Prev</button>
        <button class="secondary" :disabled="offset + links.length >= total" @click="nextPage">Next</button>
      </div>
    </div>
  </div>
</template>
