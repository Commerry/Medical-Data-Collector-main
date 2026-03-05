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

    // Load initial devices
    const loadDevices = async () => {
      const data = await ipc.invoke<SerialDevice[]>("serial:get-devices");
      if (mounted) {
        setDevices(data || []);
      }
    };

    loadDevices();

    // Listen for real-time updates
    const unsubscribe = ipc.on<SerialDevice[]>("serial:devices-updated", (data) => {
      if (mounted) {
        setDevices(data || []);
      }
    });

    // Polling เพิ่มเติมทุก 5 วินาที เพื่อให้แน่ใจว่าได้ข้อมูลล่าสุดเสมอ
    const pollInterval = setInterval(() => {
      if (mounted) {
        loadDevices();
      }
    }, 5000);

    return () => {
      mounted = false;
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, []);

  return devices;
};
