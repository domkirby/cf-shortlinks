<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api, ApiRequestError, type AdminRecord } from '../api';

const admins = ref<AdminRecord[]>([]);
const error = ref<string | null>(null);
const form = reactive({ email: '', role: 'editor' as 'owner' | 'editor' });

async function load(): Promise<void> {
  error.value = null;
  try {
    admins.value = (await api.listAdmins()).items;
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

const add = () =>
  run(async () => {
    await api.createAdmin(form.email.trim(), form.role);
    form.email = '';
    form.role = 'editor';
  });

const remove = (admin: AdminRecord) =>
  confirm(`Remove ${admin.email}?`) ? run(() => api.deleteAdmin(admin.email)) : Promise.resolve();
</script>

<template>
  <h1>Admins</h1>

  <div class="card">
    <h2>Identity vs authorization</h2>
    <p class="muted" style="margin: 0">
      Cloudflare Access decides who can reach this app at all. This list decides who can use it
      once they're through, and in what role. Adding someone here does nothing unless the Access
      policy also lets them in.
    </p>
  </div>

  <div v-if="error" class="banner error">{{ error }}</div>

  <form class="card" @submit.prevent="add">
    <h2>Add an admin</h2>
    <div class="row">
      <div class="field field--wide">
        <label for="email">Email (as your IdP reports it)</label>
        <input id="email" v-model="form.email" type="email" required placeholder="you@example.com" />
      </div>
      <div class="field">
        <label for="role">Role</label>
        <select id="role" v-model="form.role">
          <option value="editor">editor — manage links</option>
          <option value="owner">owner — also manage admins and tokens</option>
        </select>
      </div>
    </div>
    <button type="submit">Add</button>
  </form>

  <div class="card">
    <p v-if="!admins.length" class="empty">No admins yet.</p>
    <table v-else class="responsive">
      <thead>
        <tr>
          <th>Email</th>
          <th>Role</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="admin in admins" :key="admin.email">
          <td class="mono" data-label="Email">{{ admin.email }}</td>
          <td data-label="Role"><span class="pill">{{ admin.role }}</span></td>
          <td class="cell-actions">
            <button class="link danger" @click="remove(admin)">Remove</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
