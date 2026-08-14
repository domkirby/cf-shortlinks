<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { api, ApiRequestError, type OverviewStats } from '../api';
import BarChart from '../components/BarChart.vue';
import BreakdownTable from '../components/BreakdownTable.vue';

const stats = ref<OverviewStats | null>(null);
const days = ref(7);
const error = ref<string | null>(null);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    stats.value = await api.overview(days.value);
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(days, load);
</script>

<template>
  <h1>Stats</h1>

  <div v-if="error" class="banner error">{{ error }}</div>

  <div class="card">
    <div class="row" style="align-items: flex-end">
      <div class="field" style="max-width: 200px; margin: 0">
        <label for="days">Window</label>
        <select id="days" v-model.number="days">
          <option :value="1">Last 24 hours</option>
          <option :value="7">Last 7 days</option>
          <option :value="30">Last 30 days</option>
          <option :value="90">Last 90 days</option>
        </select>
      </div>
      <div v-if="stats" style="text-align: right">
        <div class="muted">Total clicks</div>
        <div class="stat">{{ stats.totalClicks.toLocaleString() }}</div>
      </div>
    </div>
  </div>

  <p v-if="loading" class="empty">Loading…</p>

  <template v-else-if="stats">
    <div class="card">
      <h2>Clicks over time</h2>
      <BarChart :points="stats.series" />
    </div>

    <div class="grid-2">
      <BreakdownTable title="Top links" :rows="stats.topLinks" key-label="Slug" />
      <BreakdownTable title="By country" :rows="stats.byCountry" key-label="Country" />
    </div>

    <BreakdownTable title="Top misses" :rows="stats.topMisses" key-label="Slug" />
    <p class="muted">
      Misses are requests for slugs that don't exist — either 404'd or sent to the
      configured fallback. A slug high on this list is one worth creating.
    </p>
  </template>
</template>
