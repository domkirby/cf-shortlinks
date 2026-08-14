<script setup lang="ts">
import type { StatsBreakdownRow } from '@domk/shared-types';

defineProps<{ title: string; rows: StatsBreakdownRow[]; keyLabel?: string }>();
</script>

<template>
  <div class="card">
    <h2>{{ title }}</h2>
    <p v-if="!rows.length" class="empty">Nothing yet.</p>
    <table v-else>
      <thead>
        <tr>
          <th>{{ keyLabel ?? 'Key' }}</th>
          <th style="text-align: right">Clicks</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <td class="mono"><span class="truncate">{{ row.key }}</span></td>
          <td class="numeric">{{ row.clicks.toLocaleString() }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
