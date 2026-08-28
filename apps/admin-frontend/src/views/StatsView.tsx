import { useState } from 'react';
import { Loader, Text } from '@cloudflare/kumo';
import { api } from '../api';
import { useAsyncData } from '../lib/useAsyncData';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { WindowSelector } from '../components/WindowSelector';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { BreakdownTable } from '../components/BreakdownTable';

export function StatsView() {
  const [days, setDays] = useState(7);
  const stats = useAsyncData(() => api.overview(days), [days]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Stats"
        actions={<WindowSelector days={days} onChange={setDays} />}
      />

      <ErrorBanner message={stats.error} />

      <Card>
        <div className="flex items-baseline gap-3">
          <Text as="h2" variant="heading">
            {(stats.data?.totalClicks ?? 0).toLocaleString()}
          </Text>
          <Text variant="secondary">total clicks in this window</Text>
        </div>
      </Card>

      {stats.loading && !stats.data ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : stats.data ? (
        <>
          <div className="grid gap-2">
            <Text as="h2" variant="heading">
              Clicks over time
            </Text>
            <Card>
              <TimeSeriesChart points={stats.data.series} />
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <BreakdownTable title="Top links" rows={stats.data.topLinks} keyLabel="Slug" />
            <BreakdownTable title="By country" rows={stats.data.byCountry} keyLabel="Country" />
          </div>

          <div className="grid gap-2">
            <BreakdownTable title="Top misses" rows={stats.data.topMisses} keyLabel="Slug" />
            <Text variant="secondary" size="sm">
              Misses are requests for slugs that don't exist — either 404'd or sent to the configured
              fallback. A slug high on this list is one worth creating.
            </Text>
          </div>
        </>
      ) : null}
    </div>
  );
}
