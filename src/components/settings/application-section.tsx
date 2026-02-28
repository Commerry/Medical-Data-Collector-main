import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { SettingsForm, UpdateField } from "@/components/settings/types";

type ApplicationSectionProps = {
  form: SettingsForm;
  updateField: UpdateField;
};

export function ApplicationSection({ form, updateField }: ApplicationSectionProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Application</h2>
        <p className="text-sm text-muted-foreground">Core runtime preferences.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="pcu-code">PCU Code</Label>
          <Input
            id="pcu-code"
            value={form.pcucode}
            onChange={(event) => updateField("pcucode", event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
          <Input
            id="session-timeout"
            type="number"
            value={form.sessionTimeoutMinutes}
            onChange={(event) =>
              updateField("sessionTimeoutMinutes", Number(event.target.value))
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="log-retention">Log Retention (days)</Label>
          <Input
            id="log-retention"
            type="number"
            value={form.logRetentionDays}
            onChange={(event) =>
              updateField("logRetentionDays", Number(event.target.value))
            }
          />
        </div>
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-start"
              checked={form.autoStart}
              onCheckedChange={(checked) => updateField("autoStart", Boolean(checked))}
            />
            <Label htmlFor="auto-start">Start with system</Label>
          </div>
        </div>
      </div>
    </section>
  );
}
