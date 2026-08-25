<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { Theme } from '@domk/shared-types';
import { api, ApiRequestError } from '../api';

const themes = ref<Theme[]>([]);
const error = ref<string | null>(null);
const editingId = ref<number | null>(null);
const form = reactive({ name: '', backgroundColor: '#0f172a', logoUrl: '' });

async function load(): Promise<void> {
  error.value = null;
  try {
    themes.value = (await api.listThemes()).items;
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : String(err);
  }
}

onMounted(load);

async function run(action: () => Promise<unknown>): Promise<void> {
  error.value = null;
  try {
    await action();
    await load();
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : String(err);
  }
}

function resetForm(): void {
  editingId.value = null;
  Object.assign(form, { name: '', backgroundColor: '#0f172a', logoUrl: '' });
}

function startEdit(theme: Theme): void {
  editingId.value = theme.id;
  Object.assign(form, {
    name: theme.name,
    backgroundColor: theme.backgroundColor,
    logoUrl: theme.logoUrl ?? '',
  });
}

const submit = () =>
  run(async () => {
    const payload = {
      name: form.name.trim(),
      backgroundColor: form.backgroundColor,
      logoUrl: form.logoUrl.trim() || null,
    };
    if (editingId.value) {
      await api.updateTheme(editingId.value, payload);
    } else {
      await api.createTheme(payload);
    }
    resetForm();
  });

const remove = (theme: Theme) =>
  confirm(`Delete theme "${theme.name}"? Links still assigned to it must be reassigned first.`)
    ? run(() => api.deleteTheme(theme.id))
    : Promise.resolve();
</script>

<template>
  <h1>Themes</h1>

  <div class="card">
    <p class="muted" style="margin: 0">
      Themes control the look of the unlock page shown for password-protected links —
      background color and an optional logo. Assign one to a link from the Links page.
    </p>
  </div>

  <div v-if="error" class="banner error">{{ error }}</div>

  <form class="card" @submit.prevent="submit">
    <h2>{{ editingId ? 'Edit theme' : 'New theme' }}</h2>
    <div class="row">
      <div class="field">
        <label for="name">Name</label>
        <input id="name" v-model="form.name" required placeholder="Default" />
      </div>
      <div class="field field--narrow">
        <label for="bg">Background color</label>
        <input id="bg" v-model="form.backgroundColor" type="color" />
      </div>
      <div class="field field--wide">
        <label for="logo">Logo URL (optional)</label>
        <input id="logo" v-model="form.logoUrl" placeholder="https://…" />
      </div>
    </div>
    <div class="actions">
      <button type="submit">{{ editingId ? 'Save changes' : 'Create theme' }}</button>
      <button v-if="editingId" type="button" class="secondary" @click="resetForm">Cancel</button>
    </div>
  </form>

  <div class="card">
    <p v-if="!themes.length" class="empty">No themes yet.</p>
    <table v-else class="responsive">
      <thead>
        <tr>
          <th>Name</th>
          <th>Background</th>
          <th>Logo</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="theme in themes" :key="theme.id">
          <td data-label="Name">{{ theme.name }}</td>
          <td data-label="Background">
            <span
              class="mono"
              :style="{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                background: theme.backgroundColor,
                marginRight: '6px',
                verticalAlign: 'middle',
              }"
            ></span>
            {{ theme.backgroundColor }}
          </td>
          <td class="muted truncate cell-full" data-label="Logo">{{ theme.logoUrl || '—' }}</td>
          <td class="cell-actions">
            <div class="actions">
              <button class="link" @click="startEdit(theme)">Edit</button>
              <button class="link danger" @click="remove(theme)">Delete</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
