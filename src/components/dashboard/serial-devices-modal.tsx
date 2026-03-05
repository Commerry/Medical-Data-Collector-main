import { X, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ipc } from "@/lib/electron-ipc";

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

type TestResult = {
  success: boolean;
  message: string;
  lastSeen?: string | Date;
  timeSinceLastSeen?: number;
};

export function SerialDevicesModal({ open, devices, onClose }: SerialDevicesModalProps) {
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const handleTestConnection = async (deviceId: string) => {
    setTesting(deviceId);
    try {
      const result = await ipc.invoke<TestResult>("serial:test-device", deviceId);
      setTestResults(prev => ({ ...prev, [deviceId]: result }));
    } catch (error) {
      setTestResults(prev => ({ 
        ...prev, 
        [deviceId]: { 
          success: false, 
          message: error instanceof Error ? error.message : "Test failed" 
        } 
      }));
    } finally {
      setTesting(null);
    }
  };
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto bg-white dark:bg-gray-900 shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 bg-white dark:bg-gray-900 sticky top-0 z-10 border-b">
          <div>
            <CardTitle>Connected Devices</CardTitle>
            <CardDescription>ESP32 devices communicating via Serial Port</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="bg-white dark:bg-gray-900">
          {devices.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <WifiOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No devices connected</p>
              <p className="text-xs mt-1">Make sure devices are powered on and sending data</p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => {
                const testResult = testResults[device.deviceId];
                const isTesting = testing === device.deviceId;
                
                return (
                  <div
                    key={device.deviceId}
                    className="border rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-800"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{device.deviceName}</span>
                          <Badge variant={device.online ? "success" : "secondary"}>
                            {device.online ? "Online" : "Offline"}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <div>ID: {device.deviceId}</div>
                          {device.macAddress && <div>MAC: {device.macAddress}</div>}
                          <div>
                            Last seen: {new Date(device.lastSeen).toLocaleString("th-TH")}
                          </div>
                        </div>
                      </div>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isTesting}
                        onClick={() => handleTestConnection(device.deviceId)}
                        className="ml-4 bg-white dark:bg-gray-700"
                      >
                        {isTesting ? (
                          <>
                            <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <Wifi className="h-3 w-3 mr-2" />
                            Test Connection
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {testResult && (
                      <div
                        className={`text-sm p-3 rounded-md ${
                          testResult.success
                            ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700"
                            : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {testResult.success ? (
                            <Wifi className="h-4 w-4" />
                          ) : (
                            <WifiOff className="h-4 w-4" />
                          )}
                          <span className="font-medium">
                            {testResult.success ? "✓ Connection OK" : "✗ Connection Failed"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs">{testResult.message}</p>
                        {testResult.timeSinceLastSeen !== undefined && (
                          <p className="mt-1 text-xs opacity-75">
                            Response time: {Math.round(testResult.timeSinceLastSeen / 1000)}s ago
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
