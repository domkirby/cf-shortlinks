<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Actor } from '@domk/shared-types';
import { api, ApiRequestError } from './api';

const actor = ref<Actor | null>(null);
const error = ref<string | null>(null);

const THEME_STORAGE_KEY = 'admin-theme';
type ThemePref = 'light' | 'dark';

function systemThemePref(): ThemePref {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(next: ThemePref): void {
  document.documentElement.setAttribute('data-theme', next);
}

const theme = ref<ThemePref>(
  (localStorage.getItem(THEME_STORAGE_KEY) as ThemePref | null) ?? systemThemePref(),
);
applyTheme(theme.value);

function toggleTheme(): void {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_STORAGE_KEY, theme.value);
  applyTheme(theme.value);
}

/**
 * `whoami` doubles as the app's readiness check: it proves Access let us
 * through *and* that this identity is in the admins table, which are two
 * different failures worth telling apart on screen.
 */
onMounted(async () => {
  try {
    actor.value = (await api.whoami()).actor;
  } catch (err) {
    error.value =
      err instanceof ApiRequestError
        ? `${err.message} (${err.code})`
        : 'Could not reach the admin API';
  }
});

const isOwner = () => actor.value?.type === 'service' || actor.value?.role === 'owner';
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <span class="brand">CF Shortlinks</span>
      <nav class="tabs">
        <RouterLink to="/links">Links</RouterLink>
        <RouterLink to="/stats">Stats</RouterLink>
        <RouterLink v-if="isOwner()" to="/tokens">Service tokens</RouterLink>
        <RouterLink v-if="isOwner()" to="/admins">Admins</RouterLink>
        <RouterLink v-if="isOwner()" to="/themes">Themes</RouterLink>
      </nav>
      <button
        type="button"
        class="theme-toggle"
        :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleTheme"
      >{{ theme === 'dark' ? '☀' : '🌙' }}</button>
      <span v-if="actor" class="identity">
        {{ actor.type === 'human' ? `${actor.email} · ${actor.role}` : `service · ${actor.name}` }}
        <a href="/cdn-cgi/access/logout" class="logout">Log out</a>
      </span>
    </header>

    <div v-if="error" class="banner error">{{ error }}</div>
    <RouterView v-else-if="actor" />
    <p v-else class="empty">Loading…</p>
  </div>
</template>
