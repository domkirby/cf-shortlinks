<script setup lang="ts">
import { computed } from 'vue';
import type { StatsPoint } from '@domk/shared-types';

const props = defineProps<{ points: StatsPoint[]; height?: number }>();

/**
 * Inline SVG rather than a charting library: this is one bar series, and a
 * chart dependency would be larger than the rest of the SPA put together.
 */
const height = computed(() => props.height ?? 120);
const max = computed(() => Math.max(1, ...props.points.map((p) => p.clicks)));
const barWidth = computed(() => 100 / Math.max(props.points.length, 1));

function label(bucket: string): string {
  const date = new Date(bucket.replace(' ', 'T') + (bucket.includes('Z') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? bucket : date.toLocaleString();
}
</script>

<template>
  <div v-if="!points.length" class="empty">No clicks in this window.</div>
  <svg
    v-else
    class="chart"
    :viewBox="`0 0 100 ${height}`"
    preserveAspectRatio="none"
    role="img"
    aria-label="Clicks over time"
  >
    <rect
      v-for="(point, i) in points"
      :key="point.bucket"
      :x="i * barWidth + barWidth * 0.1"
      :y="height - (point.clicks / max) * height"
      :width="barWidth * 0.8"
      :height="Math.max((point.clicks / max) * height, 1)"
      fill="var(--accent)"
      rx="1"
    >
      <title>{{ label(point.bucket) }} — {{ point.clicks }} clicks</title>
    </rect>
  </svg>
</template>

<style scoped>
.chart {
  width: 100%;
  height: 120px;
  display: block;
}
</style>
