import * as echarts from 'echarts';
import { Empty, TimeseriesChart } from '@cloudflare/kumo';
import type { StatsPoint } from '@domk/shared-types';
import { ChartBar } from '@phosphor-icons/react';
import { useTheme } from '../lib/theme';
import { bucketToMs } from '../lib/format';

const ACCENT = '#f6821f';

export function TimeSeriesChart({ points }: { points: StatsPoint[] }) {
  const { theme } = useTheme();

  if (!points.length) {
    return (
      <Empty
        size="sm"
        icon={<ChartBar size={32} />}
        title="No clicks in this window"
        description="Pick a wider window, or check back once the link gets traffic."
      />
    );
  }

  return (
    <TimeseriesChart
      echarts={echarts}
      type="bar"
      height={240}
      isDarkMode={theme === 'dark'}
      data={[
        {
          name: 'Clicks',
          color: ACCENT,
          data: points.map((p) => [bucketToMs(p.bucket), p.clicks]),
        },
      ]}
      yAxisName="Clicks"
    />
  );
}
