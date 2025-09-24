import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

interface ExpirationSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  autoSelectFirst?: boolean;
}

const getNextFriday = (sourceDate: Date, minimumDaysAhead = 1) => {
  const date = new Date(sourceDate);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay(); // 0=Sunday, 5=Friday
  let daysUntilFriday;

  if (day < 5) {
    daysUntilFriday = 5 - day;
  } else if (day === 5) {
    // If it's already Friday ensure we move to next week
    daysUntilFriday = minimumDaysAhead > 0 ? 7 : 0;
  } else {
    // Saturday/Sunday -> upcoming Friday
    daysUntilFriday = 7 - day + 5;
  }

  if (daysUntilFriday < minimumDaysAhead) {
    daysUntilFriday += 7;
  }

  const nextFriday = new Date(date);
  nextFriday.setDate(date.getDate() + daysUntilFriday);
  return nextFriday;
};

const formatExpiration = (date: Date, now: Date) => {
  const days = Math.max(
    0,
    Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );
  const label = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });

  return {
    value: date.toISOString().split("T")[0],
    label: `${label} (${days}d)`,
    days,
  };
};

export function ExpirationSelector({
  value,
  onValueChange,
  className = "",
  autoSelectFirst = false,
}: ExpirationSelectorProps) {
  // Fetch actual available expiration dates from database
  const { data: availableExpirations = [], isLoading } = useQuery<string[]>({
    queryKey: ["/api/available-expirations"],
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const expirations = useMemo(() => {
    if (!availableExpirations.length) {
      // Fallback to calculated Fridays if no database data
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const baseFriday = getNextFriday(now, 1);
      const items = [] as { value: string; label: string; days: number }[];
      for (let i = 0; i < 4; i++) {
        const friday = new Date(baseFriday);
        friday.setDate(baseFriday.getDate() + i * 7);
        items.push(formatExpiration(friday, now));
      }
      return items;
    }

    // Use actual database expiration dates
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    return availableExpirations
      .map((dateStr: string) => {
        const date = new Date(`${dateStr}T00:00:00`);
        return formatExpiration(date, now);
      })
      .sort((a: { days: number }, b: { days: number }) => a.days - b.days); // Sort by days until expiration
  }, [availableExpirations]);

  useEffect(() => {
    if (!value && autoSelectFirst && expirations.length > 0 && !isLoading) {
      onValueChange(expirations[0].value);
    }
  }, [value, autoSelectFirst, expirations, onValueChange, isLoading]);

  useEffect(() => {
    if (!value) return;
    const isKnownFriday = expirations.some((exp) => exp.value === value);
    if (!isKnownFriday) {
      const parsed = new Date(`${value}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        const corrected = formatExpiration(getNextFriday(parsed, 0), new Date());
        onValueChange(corrected.value);
      }
    }
  }, [value, expirations, onValueChange]);

  return (
    <div className={className} data-testid="expiration-selector">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id="expiration-select" className="w-full" data-testid="select-expiration">
          <SelectValue placeholder={value ? undefined : "Select expiration date"} />
        </SelectTrigger>
        <SelectContent>
          {isLoading ? (
            <SelectItem value="loading" disabled data-testid="expiration-loading">
              Loading expiration dates...
            </SelectItem>
          ) : expirations.length === 0 ? (
            <SelectItem value="none" disabled data-testid="expiration-none">
              No expiration dates available
            </SelectItem>
          ) : (
            expirations.map((exp: { value: string; label: string; days: number }, index: number) => (
              <SelectItem key={exp.value} value={exp.value} data-testid={`expiration-${index}`}>
                <div className="flex justify-between items-center w-full">
                  <span>{exp.label}</span>
                  {index === 0 && <span className="text-xs text-blue-500 ml-2">Next</span>}
                  {exp.days <= 7 && <span className="text-xs text-orange-500 ml-2">Weekly</span>}
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}