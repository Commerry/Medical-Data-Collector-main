"use client";

import { useEffect, useState } from "react";
import { ipc } from "../electron-ipc";

export type SyncHistoryRow = {
  id: number;
  session_id: number | null;
  idcard: string;
  visitno: number | null;
  fields_updated: string;
  sync_timestamp: string;
  sync_status: string;
  error_message?: string | null;
};

export const useHistory = (params?: { startDate?: string; endDate?: string; idcard?: string }) => {
  const [rows, setRows] = useState<SyncHistoryRow[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = () =>
      ipc
        .invoke<SyncHistoryRow[]>("history:get-visits", params ?? {})
        .then((data) => {
          if (mounted) {
            setRows(data ?? []);
          }
        });

    load();
    const unsubscribe = ipc.on("data:updated", load);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [params?.startDate, params?.endDate, params?.idcard]);

  return rows;
};
