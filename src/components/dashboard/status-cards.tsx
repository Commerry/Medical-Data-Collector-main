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
          <Badge variant={mysqlConnected ? "success" : "secondary"} className={!mysqlConnected ? 'bg-red' : 'transparent'}>
            {mysqlConnected ? "Connected" : "Disconnected"}
          </Badge>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-medium">Serial Port Status</CardTitle>
            <CardDescription>USB connection</CardDescription>
          </div>
          <Badge variant={serialConnected ? "success" : "secondary"} color={!serialConnected ? 'red' : undefined}>
            {serialConnected ? "Connected" : "Disconnected"}
          </Badge>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-medium">Active Devices</CardTitle>
            <CardDescription>ESP32 devices online</CardDescription>
          </div>
          <Badge variant="secondary">{deviceCount ?? 0}</Badge>
        </CardHeader>
        <CardContent className="pt-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenDevices}
            disabled={!onOpenDevices}
          >
            View devices
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
