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
    
    // Get initial status
    ipc.invoke<SerialStatus>("serial:get-status").then((data) => {
      if (mounted) {
        setStatus(data);
      }
    });

    // Listen for status updates
    const unsubscribe = ipc.on<SerialStatus>("serial:status", (data) => {
      if (mounted) {
        setStatus(data);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return status;
};
