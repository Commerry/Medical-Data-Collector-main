"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { MqttClientInfo } from "@/lib/hooks/use-mqtt-clients";

type MqttClientsModalProps = {
  open: boolean;
  clients: MqttClientInfo[];
  onClose: () => void;
};

export function MqttClientsModal({ open, clients, onClose }: MqttClientsModalProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    // Check initial theme
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const isDarkMode = document.documentElement.classList.contains("dark");
      setIsDark(isDarkMode);
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xl rounded-xl border shadow-lg"
        style={{ 
          backgroundColor: isDark ? "#0f172a" : "white",
          color: isDark ? "#f1f5f9" : "#0f172a"
        }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Connected MQTT clients"
      >
        <div className="flex items-start justify-between border-b p-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Connected MQTT Clients</h2>
            </div>
            <p className="text-sm text-muted-foreground">Realtime list of active connections.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="p-6">
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clients connected.</p>
          ) : (
            <ul className="space-y-4">
              {clients.map((client, index) => (
                <li key={`${client.clientId}-${client.ip ?? "unknown"}-${index}`}>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{client.clientId}</span>
                    <span className="text-xs text-muted-foreground">
                      IP: {client.ip ?? "--"}
                    </span>
                  </div>
                  {index < clients.length - 1 ? <Separator className="mt-4" /> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
