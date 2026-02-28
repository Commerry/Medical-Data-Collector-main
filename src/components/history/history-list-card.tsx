import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type HistoryRow = {
  id: number | string;
  idcard: string;
  visitno: string;
  sync_timestamp: string;
  fields_updated: string;
  sync_status: string;
};

type HistoryListCardProps = {
  rows: HistoryRow[];
};

export function HistoryListCard({ rows }: HistoryListCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardDescription>Latest synced records</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-dashed p-3">
              <div className="flex flex-wrap items-center gap-2 font-medium">
                <span>{row.idcard}</span>
                <span className="text-muted-foreground">#{row.visitno}</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {row.sync_timestamp} • {row.fields_updated} • {row.sync_status}
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="text-muted-foreground">No history found.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
