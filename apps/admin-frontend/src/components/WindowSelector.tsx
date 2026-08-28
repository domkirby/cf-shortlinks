import { Tabs } from '@cloudflare/kumo';

const OPTIONS = [
  { value: '1', label: '24 hours' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

export function WindowSelector({
  days,
  onChange,
}: {
  days: number;
  onChange: (days: number) => void;
}) {
  return (
    <Tabs
      variant="segmented"
      size="sm"
      tabs={OPTIONS}
      value={String(days)}
      onValueChange={(v) => onChange(Number(v))}
    />
  );
}
