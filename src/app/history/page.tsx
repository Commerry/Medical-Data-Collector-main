"use client";

import { useHistory } from "@/lib/hooks/use-history";
import { useState } from "react";
import { HistoryFiltersCard } from "@/components/history/history-filters-card";
import { HistoryHeader } from "@/components/history/history-header";
import { HistoryListCard } from "@/components/history/history-list-card";

export default function HistoryPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [idcard, setIdcard] = useState("");
  const rows = useHistory({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    idcard: idcard || undefined
  });

  const handleExport = () => {
    const headers = [
      "id",
      "session_id",
      "idcard",
      "visitno",
      "fields_updated",
      "sync_timestamp",
      "sync_status",
      "error_message"
    ];
    const escapeValue = (value: unknown) => {
      const text = value == null ? "" : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const lines = [headers.join(",")];
    rows.forEach((row) => {
      lines.push(
        [
          row.id,
          row.session_id,
          row.idcard,
          row.visitno,
          row.fields_updated,
          row.sync_timestamp,
          row.sync_status,
          row.error_message ?? ""
        ]
          .map(escapeValue)
          .join(",")
      );
    });

    const csvContent = lines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-6">
      <HistoryHeader />
      <HistoryFiltersCard
        startDate={startDate}
        endDate={endDate}
        idcard={idcard}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onIdcardChange={setIdcard}
        onClear={() => {
          setStartDate("");
          setEndDate("");
          setIdcard("");
        }}
        onExport={handleExport}
      />
      <HistoryListCard rows={rows.map(row => ({ ...row, visitno: String(row.visitno) }))} />
    </section>
  );
}
