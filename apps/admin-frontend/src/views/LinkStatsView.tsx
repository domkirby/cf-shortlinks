import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Loader, Text } from '@cloudflare/kumo';
import { ArrowLeft } from '@phosphor-icons/react';
import { api } from '../api';
import { useAsyncData } from '../lib/useAsyncData';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { WindowSelector } from '../components/WindowSelector';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { BreakdownTable } from '../components/BreakdownTable';

export function LinkStatsView() {
  const { slug = '' } = useParams();
  const [days, setDays] = useState(7);
  const stats = useAsyncData(() => api.linkStats(slug, days), [slug, days]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={<span className="font-mono">/{slug}</span>}
        description={
          <RouterLink
            to="/links"
            className="inline-flex items-center gap-1 text-kumo-link hover:underline"
          >
            <ArrowLeft /> All links
          </RouterLink>
        }
        actions={<WindowSelector days={days} onChange={setDays} />}
      />

      <ErrorBanner message={stats.error} />

      <Card>
        <div className="flex items-baseline gap-3">
          <Text as="h2" variant="heading">
            {(stats.data?.totalClicks ?? 0).toLocaleString()}
          </Text>
          <Text variant="secondary">clicks in this window</Text>
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
            <BreakdownTable title="By country" rows={stats.data.byCountry} keyLabel="Country" />
            <BreakdownTable title="By referrer" rows={stats.data.byReferrer} keyLabel="Referrer" />
          </div>
        </>
      ) : null}
    </div>
  );
}
