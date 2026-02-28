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
    const load = () =>
      ipc.invoke<MySqlStatus>("db:get-status").then((data) => {
        if (mounted) {
          setStatus(data ?? null);
        }
      });

    load();
    const unsubscribe = ipc.on("mysql:status", (payload) => {
      if (!mounted) {
        return;
      }
      const next = payload as MySqlStatus | undefined;
      setStatus(next ?? null);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return status;
};
