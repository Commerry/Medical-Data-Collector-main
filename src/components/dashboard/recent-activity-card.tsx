import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ActivityRow = {
  id: number | string;
  idcard: string;
  sync_status: string;
  sync_timestamp: string;
  fields_updated: string;
};

type RecentActivityCardProps = {
  rows: ActivityRow[];
};

export function RecentActivityCard({ rows }: RecentActivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardDescription>Last 5 synced records</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm">
          {rows.slice(0, 5).map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-dashed p-3 text-muted-foreground"
            >
              <div className="flex flex-wrap items-center gap-2 text-foreground">
                <span className="font-medium">{row.idcard}</span>
                <Badge variant="outline">{row.sync_status}</Badge>
              </div>
              <div className="mt-2 text-xs">
                {row.sync_timestamp} • {row.fields_updated}
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="text-muted-foreground">No activity yet.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
