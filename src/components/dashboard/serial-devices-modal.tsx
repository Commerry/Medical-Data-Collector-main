import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SerialDevice = {
  deviceId: string;
  deviceName: string;
  macAddress: string;
  lastSeen: string | Date;
  online: boolean;
};

type SerialDevicesModalProps = {
  open: boolean;
  devices: SerialDevice[];
  onClose: () => void;
};

export function SerialDevicesModal({ open, devices, onClose }: SerialDevicesModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Connected Devices</CardTitle>
            <CardDescription>ESP32 devices communicating via ESP-NOW</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No devices connected
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map((device) => (
                <div
                  key={device.deviceId}
                  className="flex items-center justify-between border rounded-lg p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{device.deviceName}</span>
                      <Badge variant={device.online ? "success" : "secondary"}>
                        {device.online ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <div>ID: {device.deviceId}</div>
                      {device.macAddress && <div>MAC: {device.macAddress}</div>}
                      <div>
                        Last seen: {new Date(device.lastSeen).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
