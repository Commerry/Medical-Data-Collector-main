import { Badge } from "@/components/ui/badge";

export function DashboardHeader() {
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground">
        MQTT status, active sessions, and recent activity in one place.
      </p>
    </div>
  );
}
