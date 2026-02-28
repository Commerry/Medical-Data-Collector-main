"use client";

import { useEffect, useState } from "react";
import { ipc } from "../electron-ipc";

export type SerialDevice = {
  deviceId: string;
  deviceName: string;
  macAddress: string;
  lastSeen: string;
  online: boolean;
};

export const useSerialDevices = () => {
  const [devices, setDevices] = useState<SerialDevice[]>([]);

  useEffect(() => {
    let mounted = true;

    // Get initial devices
    ipc.invoke<SerialDevice[]>("serial:get-devices").then((data) => {
      if (mounted) {
        setDevices(data || []);
      }
    });

    // Listen for device updates
    const unsubscribe = ipc.on<SerialDevice[]>("serial:devices-updated", (data) => {
      if (mounted) {
        setDevices(data || []);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return devices;
};
