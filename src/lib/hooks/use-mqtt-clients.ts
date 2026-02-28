"use client";

import { useEffect, useState } from "react";
import { ipc } from "../electron-ipc";

export type MqttClientInfo = {
  clientId: string;
  ip: string | null;
};

export const useMqttClients = () => {
  const [clients, setClients] = useState<MqttClientInfo[]>([]);

  useEffect(() => {
    let mounted = true;

    ipc.invoke<MqttClientInfo[]>("mqtt:get-clients").then((data) => {
      if (mounted) {
        setClients(Array.isArray(data) ? data : []);
      }
    });

    const unsubscribe = ipc.on("mqtt:clients-updated", (data) => {
      if (!mounted) {
        return;
      }
      if (Array.isArray(data)) {
        setClients(data as MqttClientInfo[]);
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  return clients;
};
