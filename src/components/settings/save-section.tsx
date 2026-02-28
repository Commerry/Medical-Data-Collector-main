import { Button } from "@/components/ui/button";

type SaveSectionProps = {
  status: string;
  onSave: () => void;
};

export function SaveSection({ status, onSave }: SaveSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Save to apply settings for the next sync session.
        </div>
        <Button
          onClick={onSave}
          type="button"
          style={{ backgroundColor: "rgb(46, 154, 64)" }}
          className="text-white hover:opacity-90"
        >
          Save Settings
        </Button>
      </div>
      {status && <div className="text-sm text-muted-foreground">{status}</div>}
    </section>
  );
}
