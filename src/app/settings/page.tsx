"use client";

import { useConfig } from "@/lib/hooks/use-config";
import { ipc } from "@/lib/electron-ipc";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DatabaseSection } from "@/components/settings/database-section";
import { SerialSection } from "@/components/settings/serial-section";
import { ApplicationSection } from "@/components/settings/application-section";
import { ThemeSection } from "@/components/settings/theme-section";
import { SaveSection } from "@/components/settings/save-section";
import { SettingsHeader } from "@/components/settings/settings-header";
import type { SettingsForm } from "@/components/settings/types";

export default function SettingsPage() {
  const config = useConfig();
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState<SettingsForm>({
    host: "",
    port: 3306,
    username: "",
    password: "",
    database: "",
    portName: "",
    baudRate: 115200,
    pcucode: "",
    sessionTimeoutMinutes: 10,
    logRetentionDays: 30,
    autoStart: true
  });
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [testState, setTestState] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [testMessage, setTestMessage] = useState<string>("");

  useEffect(() => {
    if (config) {
      setForm({
        host: config.database.host,
        port: config.database.port,
        username: config.database.username,
        password: config.database.password,
        database: config.database.database,
        portName: config.serial?.portName || "",
        baudRate: config.serial?.baudRate || 115200,
        pcucode: config.app.pcucode,
        sessionTimeoutMinutes: config.app.sessionTimeoutMinutes,
        logRetentionDays: config.app.logRetentionDays,
        autoStart: config.app.autoStart
      });
    }
  }, [config]);

  const updateField = (key: keyof typeof form, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (testState !== "idle") {
      setTestState("idle");
      setTestMessage("");
    }
  };

  const handleTestConnection = async () => {
    setTestState("loading");
    setTestMessage("Testing connection...");
    const result = await ipc.invoke<{ ok: boolean; error?: string }>(
      "db:test-connection",
      {
        host: form.host,
        port: form.port,
        username: form.username,
        password: form.password,
        database: form.database
      }
    );
    if (result.ok) {
      setTestState("success");
      setTestMessage("Connection successful");
    } else {
      setTestState("error");
      setTestMessage(`Connection failed: ${result.error}`);
    }
  };

  const handleSave = async () => {
    setSaveStatus("Saving...");
    await ipc.invoke("config:set", {
      database: {
        host: form.host,
        port: form.port,
        username: form.username,
        password: form.password,
        database: form.database
      },
      serial: {
        portName: form.portName,
        baudRate: form.baudRate
      },
      app: {
        pcucode: form.pcucode,
        sessionTimeoutMinutes: form.sessionTimeoutMinutes,
        logRetentionDays: form.logRetentionDays,
        autoStart: form.autoStart
      }
    });

    // ส่งข้อมูลไปยัง API ผ่าน main process
    try {
      const systemInfo = await ipc.invoke<{ hostname: string; ip: string }>("system:get-info");
      
      const response = await ipc.invoke<{ ok: boolean; error?: string; data?: string }>(
        "system:register-to-api",
        {
          pCUCode: form.pcucode,
          hostname: systemInfo.hostname,
          iP: systemInfo.ip
        }
      );

      if (response.ok) {
        setSaveStatus("Settings saved and synced");
      } else {
        setSaveStatus(`Settings saved (sync failed: ${response.error})`);
      }
    } catch (error) {
      console.error("Failed to sync to API:", error);
      setSaveStatus("Settings saved (sync failed)");
    }
  };

  return (
    <section className="space-y-6">
      <SettingsHeader />

      <Card>
        <CardContent className="space-y-8 mt-4">
          <DatabaseSection
            form={form}
            updateField={updateField}
            onTestConnection={handleTestConnection}
            testState={testState}
            testMessage={testMessage}
          />

          <Separator />

          <SerialSection form={form} updateField={updateField} />

          <Separator />

          <ApplicationSection form={form} updateField={updateField} />

          <Separator />

          <ThemeSection theme={theme} setTheme={setTheme} />

          <Separator />

          <SaveSection status={saveStatus} onSave={handleSave} />
        </CardContent>
      </Card>
    </section>
  );
}
