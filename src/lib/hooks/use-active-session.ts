"use client";

import { useEffect, useState } from "react";
import { ipc } from "../electron-ipc";

export type ActiveSession = {
  id: number;
  idcard: string | null;
  pid: number;
  pcucode: string | null;
  pcucodeperson: string;
  visitno: number | null;
  visitdate: string | null;
  weight?: number | null;
  height?: number | null;
  pressure?: string | null;
  temperature?: number | null;
  pulse?: number | null;
  session_start: string;
  last_update: string;
};

export const useActiveSession = (pollMs = 3000) => {
  const [session, setSession] = useState<ActiveSession | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = () =>
      ipc.invoke<ActiveSession | null>("session:get-active").then((data) => {
        if (mounted) {
          setSession(data ?? null);
        }
      });

    load();
    const timer = setInterval(load, pollMs);
    const unsubscribeStarted = ipc.on("session:started", load);
    const unsubscribeUpdated = ipc.on("session:updated", load);

    return () => {
      mounted = false;
      clearInterval(timer);
      unsubscribeStarted();
      unsubscribeUpdated();
    };
  }, [pollMs]);

  return session;
};
