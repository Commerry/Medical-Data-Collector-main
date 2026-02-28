import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FiltersProps = {
  startDate: string;
  endDate: string;
  idcard: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onIdcardChange: (value: string) => void;
  onClear: () => void;
  onExport: () => void;
};

export function HistoryFiltersCard({
  startDate,
  endDate,
  idcard,
  onStartDateChange,
  onEndDateChange,
  onIdcardChange,
  onClear,
  onExport
}: FiltersProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Filters</CardTitle>
        <CardDescription>Refine the records shown below.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="start-date">Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="end-date">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="id-card">ID Card</Label>
            <Input
              id="id-card"
              value={idcard}
              onChange={(event) => onIdcardChange(event.target.value)}
              placeholder="Search by ID card"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" type="button" onClick={onClear}>
            Clear
          </Button>
          <Button type="button" onClick={onExport}>
            Export CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
