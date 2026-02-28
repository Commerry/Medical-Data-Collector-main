import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ActiveSessionCardProps = {
  session?: {
    idcard?: string | null;
    visitno?: string | number | null;
    last_update?: string | null;
    weight?: string | number | null;
    height?: string | number | null;
    pressure?: string | null;
    temperature?: string | number | null;
    pulse?: string | number | null;
  } | null;
};

export function ActiveSessionCard({ session }: ActiveSessionCardProps) {
  const formatLocalDateTime = (value?: string | null) => {
    if (!value) {
      return "--";
    }

    // SQLite timestamps are stored without timezone; treat them as UTC and render in machine local time.
    const asIsoUtc = value.includes("T") ? `${value.endsWith("Z") ? value : `${value}Z`}` : `${value.replace(" ", "T")}Z`;
    const parsed = new Date(asIsoUtc);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(parsed);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Active Session</CardTitle>
        <CardDescription>Latest incoming vitals</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">ID Card</span>
          <span className="font-medium">{session?.idcard ?? "--"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Visit No</span>
          <span className="font-medium">{session?.visitno ?? "--"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Last Update</span>
          <span className="font-medium">{formatLocalDateTime(session?.last_update)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Weight</span>
          <span className="font-medium">{session?.weight ?? "--"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Height</span>
          <span className="font-medium">{session?.height ?? "--"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">BP</span>
          <span className="font-medium">{session?.pressure ?? "--"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Temperature</span>
          <span className="font-medium">{session?.temperature ?? "--"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Pulse</span>
          <span className="font-medium">{session?.pulse ?? "--"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
