"use client";

import { useEffect, useState } from "react";
import { ipc } from "../electron-ipc";

export type SerialStatus = {
  connected: boolean;
  portName: string;
};

export const useSerialStatus = () => {
  const [status, setStatus] = useState<SerialStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const loadStatus = async () => {
      const data = await ipc.invoke<SerialStatus>("serial:get-status");
      if (mounted) {
        setStatus(data);
      }
    };
    
    // Load initial status
    loadStatus();

    // Listen for real-time status updates
    const unsubscribe = ipc.on<SerialStatus>("serial:status", (data) => {
      if (mounted) {
        setStatus(data);
      }
    });
    
    // Polling ทุก 5 วินาที (เพิ่มความแน่นอน)
    const pollInterval = setInterval(() => {
      if (mounted) {
        loadStatus();
      }
    }, 5000);

    return () => {
      mounted = false;
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, []);

  return status;
};
