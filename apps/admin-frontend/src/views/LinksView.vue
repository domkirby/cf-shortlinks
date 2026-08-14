<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { Link } from '@domk/shared-types';
import { api, ApiRequestError } from '../api';

const links = ref<Link[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const editingId = ref<number | null>(null);

const filters = reactive({ q: '', active: '' });
const form = reactive({
  slug: '',
  destination: '',
  expiresAt: '',
  tags: '',
  active: true,
});

function reportError(err: unknown): void {
  error.value = err instanceof ApiRequestError ? err.message : String(err);
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const page = await api.listLinks({ q: filters.q, active: filters.active, limit: '100' });
    links.value = page.items;
    total.value = page.total;
  } catch (err) {
    reportError(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function resetForm(): void {
  editingId.value = null;
  Object.assign(form, { slug: '', destination: '', expiresAt: '', tags: '', active: true });
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

  const payload = {
    slug: form.slug.trim() || undefined,
    destination: form.destination.trim(),
    expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : null,
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    active: form.active,
  };

  try {
    const result = editingId.value
      ? await api.updateLink(editingId.value, payload)
      : await api.createLink(payload);
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

const shortUrlFor = (link: Link) => `https://domk.pro/${link.slug}`;
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
      <div class="field" style="flex: 3">
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
      <div class="field" style="max-width: 120px">
        <label for="active">Active</label>
        <input id="active" v-model="form.active" type="checkbox" style="width: auto" />
      </div>
    </div>
    <div class="actions">
      <button type="submit">{{ editingId ? 'Save changes' : 'Create link' }}</button>
      <button v-if="editingId" type="button" class="secondary" @click="resetForm">Cancel</button>
    </div>
  </form>

  <div class="card">
    <div class="row" style="margin-bottom: 12px">
      <input v-model="filters.q" placeholder="Search slug or destination" @keyup.enter="load" />
      <select v-model="filters.active" @change="load">
        <option value="">All</option>
        <option value="true">Active only</option>
        <option value="false">Inactive only</option>
      </select>
      <button class="secondary" style="max-width: 120px" @click="load">Search</button>
    </div>

    <p v-if="loading" class="empty">Loading…</p>
    <p v-else-if="!links.length" class="empty">No links yet.</p>
    <table v-else>
      <thead>
        <tr>
          <th>Slug</th>
          <th>Destination</th>
          <th>Tags</th>
          <th>Expires</th>
          <th>State</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="link in links" :key="link.id">
          <td class="mono">/{{ link.slug }}</td>
          <td>
            <a class="truncate mono" :href="link.destination" target="_blank" rel="noopener noreferrer">
              {{ link.destination }}
            </a>
          </td>
          <td class="muted">{{ link.tags.join(', ') || '—' }}</td>
          <td class="muted">{{ link.expiresAt ? formatDate(link.expiresAt) : '—' }}</td>
          <td>
            <span class="pill" :class="link.active ? 'on' : 'off'">
              {{ link.active ? 'active' : 'off' }}
            </span>
          </td>
          <td>
            <div class="actions">
              <button class="link" @click="copy(shortUrlFor(link))">Copy</button>
              <button class="link" @click="startEdit(link)">Edit</button>
              <button class="link" @click="toggleActive(link)">
                {{ link.active ? 'Disable' : 'Enable' }}
              </button>
              <RouterLink :to="`/links/${link.slug}/stats`">Stats</RouterLink>
              <button class="link" style="color: var(--danger)" @click="remove(link)">Delete</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="muted" style="margin: 12px 0 0">{{ total }} link(s)</p>
  </div>
</template>
