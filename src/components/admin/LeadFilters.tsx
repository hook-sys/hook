import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/types/lead";

export function LeadFilters({
  search,
  status,
}: {
  search: string;
  status: string;
}) {
  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="search" className="mb-1.5 block text-sm font-medium text-slate-700">
          Search
        </label>
        <Input
          id="search"
          name="search"
          defaultValue={search}
          placeholder="Business name or mobile number"
        />
      </div>
      <div className="sm:w-56">
        <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-slate-700">
          Status
        </label>
        <Select id="status" name="status" defaultValue={status}>
          <option value="all">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary">
        Filter
      </Button>
    </form>
  );
}
