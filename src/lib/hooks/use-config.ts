"use client";

import { useEffect, useState } from "react";
import { ipc } from "../electron-ipc";

export type AppConfig = {
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  mqtt: {
    port: number;
    username: string;
    password: string;
  };
  app: {
    pcucode: string;
    sessionTimeoutMinutes: number;
    logRetentionDays: number;
    autoStart: boolean;
  };
};

export const useConfig = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    let mounted = true;
    ipc.invoke<AppConfig>("config:get-all").then((data) => {
      if (mounted) {
        setConfig(data);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return config;
};
