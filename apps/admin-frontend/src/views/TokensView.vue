<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { ServiceToken } from '@domk/shared-types';
import { api, ApiRequestError } from '../api';

const tokens = ref<ServiceToken[]>([]);
const error = ref<string | null>(null);
const form = reactive({ name: '', description: '' });

async function load(): Promise<void> {
  error.value = null;
  try {
    tokens.value = (await api.listTokens()).items;
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

const register = () =>
  run(async () => {
    await api.createToken(form.name.trim(), form.description.trim() || undefined);
    form.name = '';
    form.description = '';
  });

const forget = (token: ServiceToken) =>
  confirm(
    `Forget "${token.name}"? The credential keeps passing Access until you delete it there too.`,
  )
    ? run(() => api.deleteToken(token.name))
    : Promise.resolve();

const formatDate = (epochMs: number) => new Date(epochMs).toLocaleDateString();
</script>

<template>
  <h1>Service tokens</h1>

  <div class="card">
    <h2>How these work</h2>
    <p class="muted" style="margin: 0">
      The credential itself lives in Cloudflare Access — create the service token in Zero
      Trust, scoped to the <span class="mono">links.domk.pro</span> application, then register
      its <strong>name</strong> here so this API will honour it. Registering does not mint a
      secret, and nothing on this page can show you one.
    </p>
    <p class="muted">
      Revocation has two independent levers: disable it here to cut it off at the app layer
      instantly, or delete it in Access to stop it at the edge. Retiring a token for good means
      doing both.
    </p>
  </div>

  <div v-if="error" class="banner error">{{ error }}</div>

  <form class="card" @submit.prevent="register">
    <h2>Register a token</h2>
    <div class="row">
      <div class="field">
        <label for="name">Name (must match Access exactly)</label>
        <input id="name" v-model="form.name" required placeholder="ci-deploy" />
      </div>
      <div class="field" style="flex: 2">
        <label for="description">What is it for?</label>
        <input id="description" v-model="form.description" placeholder="n8n workflow, release job…" />
      </div>
    </div>
    <button type="submit">Register</button>
  </form>

  <div class="card">
    <p v-if="!tokens.length" class="empty">No service tokens registered.</p>
    <table v-else>
      <thead>
        <tr>
          <th>Name</th>
          <th>State</th>
          <th>Registered</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="token in tokens" :key="token.name">
          <td class="mono">{{ token.name }}</td>
          <td>
            <span class="pill" :class="token.active ? 'on' : 'off'">
              {{ token.active ? 'active' : 'revoked' }}
            </span>
          </td>
          <td class="muted">{{ formatDate(token.createdAt) }}</td>
          <td>
            <div class="actions">
              <button class="link" @click="run(() => api.setTokenActive(token.name, !token.active))">
                {{ token.active ? 'Revoke' : 'Re-enable' }}
              </button>
              <button class="link" style="color: var(--danger)" @click="forget(token)">Forget</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
