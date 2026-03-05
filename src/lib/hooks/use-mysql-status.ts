"use client";

import { useEffect, useState } from "react";
import { ipc } from "../electron-ipc";

export type MySqlStatus = {
  connected: boolean;
};

export const useMySqlStatus = (_pollMs = 5000) => {
  const [status, setStatus] = useState<MySqlStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const load = async () => {
      const data = await ipc.invoke<MySqlStatus>("db:get-status");
      if (mounted) {
        setStatus(data ?? null);
      }
    };

    // Load initial status
    load();
    
    // Listen for real-time updates
    const unsubscribe = ipc.on("mysql:status", (payload) => {
      if (!mounted) {
        return;
      }
      const next = payload as MySqlStatus | undefined;
      setStatus(next ?? null);
    });
    
    // Polling ทุก 10 วินาที (เพิ่มเติมจาก backend check)
    const pollInterval = setInterval(() => {
      if (mounted) {
        load();
      }
    }, 10000);

    return () => {
      mounted = false;
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, []);

  return status;
};
