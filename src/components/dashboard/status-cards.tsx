import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type StatusCardsProps = {
  serialConnected?: boolean;
  mysqlConnected?: boolean;
  deviceCount?: number;
  onOpenDevices?: () => void;
};

export function StatusCards({
  serialConnected,
  mysqlConnected,
  deviceCount,
  onOpenDevices
}: StatusCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-medium">MySQL Status</CardTitle>
            <CardDescription>Database availability</CardDescription>
          </div>
          <Badge variant={mysqlConnected ? "success" : "secondary"} className={!mysqlConnected ? 'bg-red-500 text-white' : ''}>
            {mysqlConnected ? "Connected" : "Disconnected"}
          </Badge>
        </CardHeader>
        <CardContent className="pt-0">
          <span className="text-xs text-muted-foreground">
            Auto-refresh: 10s
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-medium">Serial Port Status</CardTitle>
            <CardDescription>USB connection</CardDescription>
          </div>
          <Badge variant={serialConnected ? "success" : "secondary"} className={!serialConnected ? 'bg-red-500 text-white' : ''}>
            {serialConnected ? "Connected" : "Disconnected"}
          </Badge>
        </CardHeader>
        <CardContent className="pt-0">
          <span className="text-xs text-muted-foreground">
            Real-time monitoring
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-medium">Active Devices</CardTitle>
            <CardDescription>ESP32 devices online</CardDescription>
          </div>
          <div className="text-right">
            <Badge variant="secondary" className="text-base font-semibold px-3">
              {deviceCount ?? 0}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenDevices}
              disabled={!onOpenDevices}
            >
              View devices
            </Button>
            <span className="text-xs text-muted-foreground">
              Auto-refresh: 5s
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
