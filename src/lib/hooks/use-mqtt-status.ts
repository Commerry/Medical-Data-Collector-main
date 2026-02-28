"use client";

import { useEffect, useState } from "react";
import { ipc } from "../electron-ipc";

export type MqttStatus = {
  running: boolean;
  port: number;
};

export const useMqttStatus = () => {
  const [status, setStatus] = useState<MqttStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    ipc.invoke<MqttStatus>("mqtt:get-status").then((data) => {
      if (mounted) {
        setStatus(data);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return status;
};
