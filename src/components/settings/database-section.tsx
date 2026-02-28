import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { SettingsForm, UpdateField } from "@/components/settings/types";

type DatabaseSectionProps = {
  form: SettingsForm;
  updateField: UpdateField;
  onTestConnection: () => void;
  testState: "idle" | "loading" | "success" | "error";
  testMessage: string;
};

export function DatabaseSection({
  form,
  updateField,
  onTestConnection,
  testState,
  testMessage
}: DatabaseSectionProps) {
  const isLoading = testState === "loading";
  const isSuccess = testState === "success";
  const isError = testState === "error";

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Database</h2>
        <p className="text-sm text-muted-foreground">Primary MySQL connection details.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="db-host">Host</Label>
          <Input
            id="db-host"
            value={form.host}
            onChange={(event) => updateField("host", event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="db-port">Port</Label>
          <Input
            id="db-port"
            type="number"
            value={form.port}
            onChange={(event) => updateField("port", Number(event.target.value))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="db-username">Username</Label>
          <Input
            id="db-username"
            value={form.username}
            onChange={(event) => updateField("username", event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="db-password">Password</Label>
          <Input
            id="db-password"
            type="password"
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
          />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="db-name">Database</Label>
          <Input
            id="db-name"
            value={form.database}
            onChange={(event) => updateField("database", event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={onTestConnection}
          type="button"
          disabled={isLoading || isSuccess}
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Test Connection
        </Button>
        {testMessage && (
          <div className="flex items-center gap-2 text-sm">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSuccess && <Check className="h-4 w-4 text-emerald-500" />}
            {isError && <X className="h-4 w-4 text-rose-500" />}
            <span className="text-muted-foreground">{testMessage}</span>
          </div>
        )}
      </div>
    </section>
  );
}
