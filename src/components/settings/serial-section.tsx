import { useEffect, useState } from "react";
import { ipc } from "@/lib/electron-ipc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { SettingsForm, UpdateField } from "@/components/settings/types";

type SerialSectionProps = {
  form: SettingsForm;
  updateField: UpdateField;
};

type SerialPortInfo = {
  path: string;
  manufacturer?: string;
};

export function SerialSection({ form, updateField }: SerialSectionProps) {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPorts = async () => {
    setLoading(true);
    try {
      const result = await ipc.invoke<SerialPortInfo[]>("serial:get-ports");
      setPorts(result || []);
    } catch (error) {
      console.error("Failed to load serial ports:", error);
      setPorts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPorts();
  }, []);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Serial Port</h2>
        <p className="text-sm text-muted-foreground">
          Configure USB serial port for ESP-NOW communication.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="serial-port">Port Name</Label>
            <div className="flex gap-2">
              <Select
                value={form.portName || ""}
                onValueChange={(value) => updateField("portName", value)}
              >
                <SelectTrigger id="serial-port">
                  <SelectValue placeholder="Select a port" />
                </SelectTrigger>
                <SelectContent>
                  {ports.length === 0 ? (
                    <SelectItem value="none" disabled>
                      {loading ? "Loading..." : "No ports found"}
                    </SelectItem>
                  ) : (
                    ports.map((port) => (
                      <SelectItem key={port.path} value={port.path}>
                        {port.path} {port.manufacturer ? `(${port.manufacturer})` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={loadPorts}
                disabled={loading}
              >
                Refresh
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-port" className="text-xs text-muted-foreground">
              Or enter port manually
            </Label>
            <Input
              id="manual-port"
              placeholder="e.g., COM3 or /dev/ttyUSB0"
              value={form.portName || ""}
              onChange={(event) => updateField("portName", event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="baud-rate">Baud Rate</Label>
          <Select
            value={String(form.baudRate || 115200)}
            onValueChange={(value) => updateField("baudRate", Number(value))}
          >
            <SelectTrigger id="baud-rate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="9600">9600</SelectItem>
              <SelectItem value="19200">19200</SelectItem>
              <SelectItem value="38400">38400</SelectItem>
              <SelectItem value="57600">57600</SelectItem>
              <SelectItem value="115200">115200</SelectItem>
              <SelectItem value="230400">230400</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
