import { Table, Text } from '@cloudflare/kumo';
import type { StatsBreakdownRow } from '@domk/shared-types';
import { Card } from './Card';

export function BreakdownTable({
  title,
  rows,
  keyLabel = 'Key',
}: {
  title: string;
  rows: StatsBreakdownRow[];
  keyLabel?: string;
}) {
  return (
    <div className="grid gap-2">
      <Text as="h2" variant="heading">
        {title}
      </Text>
      <Card flush>
        {rows.length === 0 ? (
          <p className="card-body text-sm text-kumo-subtle">Nothing yet.</p>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{keyLabel}</Table.Head>
                <Table.Head className="text-right">Clicks</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.key}>
                  <Table.Cell>
                    <Text variant="mono" truncate>
                      {row.key || '—'}
                    </Text>
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">
                    {row.clicks.toLocaleString()}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Card>
    </div>
  );
}
