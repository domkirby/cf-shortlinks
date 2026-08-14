<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { LinkStats } from '@domk/shared-types';
import { api, ApiRequestError } from '../api';
import BarChart from '../components/BarChart.vue';
import BreakdownTable from '../components/BreakdownTable.vue';

const props = defineProps<{ slug: string }>();

const stats = ref<LinkStats | null>(null);
const days = ref(7);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  error.value = null;
  try {
    stats.value = await api.linkStats(props.slug, days.value);
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : String(err);
  }
}

onMounted(load);
watch([days, () => props.slug], load);
</script>

<template>
  <h1 class="mono">/{{ slug }}</h1>
  <p><RouterLink to="/links">← All links</RouterLink></p>

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
        <div class="muted">Clicks</div>
        <div class="stat">{{ stats.totalClicks.toLocaleString() }}</div>
      </div>
    </div>
  </div>

  <template v-if="stats">
    <div class="card">
      <h2>Clicks over time</h2>
      <BarChart :points="stats.series" />
    </div>
    <div class="grid-2">
      <BreakdownTable title="By country" :rows="stats.byCountry" key-label="Country" />
      <BreakdownTable title="By referrer" :rows="stats.byReferrer" key-label="Referrer" />
    </div>
  </template>
</template>
