import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { strategyTypes, type StrategyType } from "@shared/schema";

interface StrategySelectorProps {
  value: StrategyType;
  onValueChange: (value: StrategyType) => void;
  className?: string;
}

export function StrategySelector({ value, onValueChange, className = "" }: StrategySelectorProps) {
  const strategies = [
    { value: strategyTypes.LONG_STRANGLE, label: "Long Strangle" },
    { value: strategyTypes.SHORT_STRANGLE, label: "Short Strangle" },
    { value: strategyTypes.IRON_CONDOR, label: "Iron Condor" },
    { value: strategyTypes.DIAGONAL_CALENDAR, label: "Diagonal Calendar" },
    { value: strategyTypes.BUTTERFLY_SPREAD, label: "Butterfly Spread" }
  ];

  return (
    <div className={className} data-testid="strategy-selector">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id="strategy-select" className="w-full" data-testid="select-strategy">
          <SelectValue placeholder="Select a strategy" />
        </SelectTrigger>
        <SelectContent>
          {strategies.map((strategy) => (
            <SelectItem key={strategy.value} value={strategy.value} data-testid={`strategy-${strategy.value}`}>
              {strategy.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}