import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  STRATEGY_LIBRARY,
  COMPLEXITY_LABELS,
  COMPLEXITY_DISPLAY_COUNTS,
  type StrategyDefinition,
  type StrategyComplexity,
} from "@/data/strategy-library";

const COMPLEXITY_SEQUENCE: StrategyComplexity[] = ['beginner', 'intermediate', 'advanced'];

type ComplexityFilterValue = 'all' | StrategyComplexity;
type StrategyFilterValue = 'all' | string;

interface StrategyLibraryProps {
  activeStrategies?: Record<string, { count: number; tickers: string[] }>;
}

const riskTone: Record<StrategyDefinition['riskLevel'], string> = {
  Low: 'bg-emerald-100 text-emerald-900 border border-emerald-200',
  Medium: 'bg-amber-100 text-amber-900 border border-amber-200',
  High: 'bg-rose-100 text-rose-900 border border-rose-200',
};

const STRATEGY_TO_PORTFOLIO_KEY: Record<string, string> = {
  'long-strangle': 'long_strangle',
  'short-strangle': 'short_strangle',
  'iron-condor': 'iron_condor',
  'iron-butterfly': 'butterfly_spread',
  'standard-butterfly': 'butterfly_spread',
  'broken-wing-butterfly': 'butterfly_spread',
  'unbalanced-butterfly': 'butterfly_spread',
  'call-calendar': 'diagonal_calendar',
  'put-calendar': 'diagonal_calendar',
  'diagonal-calendar': 'diagonal_calendar',
  'calendar-ladder': 'diagonal_calendar',
  'diagonal-income': 'diagonal_calendar',
  'double-diagonal': 'diagonal_calendar',
  'double-calendar': 'diagonal_calendar',
};

const getActiveSummary = (
  strategyId: string,
  usageMap?: Record<string, { count: number; tickers: string[] }>
) => {
  if (!usageMap) return null;
  const alias = STRATEGY_TO_PORTFOLIO_KEY[strategyId];
  if (!alias) return null;
  const usage = usageMap[alias];
  if (!usage || usage.count === 0) return null;
  return usage;
};

export function StrategyLibrary({ activeStrategies }: StrategyLibraryProps) {
  const [complexityFilter, setComplexityFilter] = useState<ComplexityFilterValue>('all');
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilterValue>('all');

  const groupedStrategies = useMemo(() => {
    return COMPLEXITY_SEQUENCE.map((complexity) => ({
      complexity,
      label: COMPLEXITY_LABELS[complexity],
      items: STRATEGY_LIBRARY.filter((strategy) => strategy.complexity === complexity),
    }));
  }, []);

  const filteredStrategies = useMemo(() => {
    let list = STRATEGY_LIBRARY;

    if (complexityFilter !== 'all') {
      list = list.filter((strategy) => strategy.complexity === complexityFilter);
    }

    if (strategyFilter !== 'all') {
      list = list.filter((strategy) => strategy.id === strategyFilter);
    }

    return list;
  }, [complexityFilter, strategyFilter]);

  const activeComplexityLabel =
    complexityFilter === 'all'
      ? 'All complexity levels'
      : `${COMPLEXITY_LABELS[complexityFilter]} strategies`;

  const portfolioUsage = useMemo(() => activeStrategies ?? {}, [activeStrategies]);

  return (
    <section className="space-y-6" data-testid="strategy-library">
      <Card className="p-6 space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Strategy Library</h2>
            <p className="text-sm text-muted-foreground">
              Browse option strategies by complexity, see key metrics at a glance, and connect the theory to the live positions in your portfolio.
            </p>
          </div>
          <Badge variant="outline" className="text-sm font-medium">
            {filteredStrategies.length} strategy{filteredStrategies.length === 1 ? '' : ' cards'}
          </Badge>
        </header>

        <Alert variant="warning" className="bg-amber-50/80 border-amber-200 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div className="space-y-1">
              <AlertTitle>Options involve substantial risk</AlertTitle>
              <AlertDescription>
                Real-world pricing and greeks update when you sync data. Always validate assumptions with current market conditions before trading.
              </AlertDescription>
            </div>
          </div>
        </Alert>

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium uppercase text-muted-foreground" htmlFor="complexity-filter">
              Complexity
            </label>
            <Select
              value={complexityFilter}
              onValueChange={(value) => setComplexityFilter(value as ComplexityFilterValue)}
            >
              <SelectTrigger id="complexity-filter" className="w-full">
                <SelectValue placeholder="All complexity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All complexity levels</SelectItem>
                {COMPLEXITY_SEQUENCE.map((complexity) => (
                  <SelectItem key={complexity} value={complexity}>
                    {COMPLEXITY_LABELS[complexity]} ({COMPLEXITY_DISPLAY_COUNTS[complexity]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium uppercase text-muted-foreground" htmlFor="strategy-filter">
              Strategy
            </label>
            <Select
              value={strategyFilter}
              onValueChange={(value) => setStrategyFilter(value as StrategyFilterValue)}
            >
              <SelectTrigger id="strategy-filter" className="w-full">
                <SelectValue placeholder="All strategies" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All strategies</SelectItem>
                {groupedStrategies.map((group) => (
                  <div key={group.complexity}>
                    <div className="px-3 pt-2 text-xs font-semibold uppercase text-muted-foreground">
                      {COMPLEXITY_LABELS[group.complexity]}
                    </div>
                    {group.items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:w-40 lg:self-end">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setComplexityFilter('all');
                setStrategyFilter('all');
              }}
            >
              Reset filters
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Showing {filteredStrategies.length} of {STRATEGY_LIBRARY.length} strategies — {activeComplexityLabel}.
        </div>

        {filteredStrategies.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No strategies match the current filter selection.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredStrategies.map((strategy) => {
              const usage = getActiveSummary(strategy.id, portfolioUsage);
              const tickers = usage?.tickers ?? [];
              const previewTickers = tickers.slice(0, 3).join(', ');
              const remainingCount = tickers.length - Math.min(tickers.length, 3);
              return (
                <Card key={strategy.id} className="flex h-full flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground">
                        {COMPLEXITY_LABELS[strategy.complexity]}
                      </div>
                      <h3 className="text-lg font-semibold leading-tight">{strategy.name}</h3>
                    </div>
                    <Badge className={`${riskTone[strategy.riskLevel]} text-xs font-semibold`}>
                      {strategy.riskLevel} risk
                    </Badge>
                  </div>

                  {usage && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-xs">
                        In portfolio • {usage.count}
                      </Badge>
                      <span>
                        {previewTickers}
                        {remainingCount > 0 ? ` +${remainingCount} more` : ''}
                      </span>
                    </div>
                  )}

                  <p className="text-sm text-muted-foreground">{strategy.summary}</p>

                  <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Example setup</div>
                    <div className="font-medium text-foreground">{strategy.exampleTicker}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{strategy.exampleNotes}</p>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-foreground">Key metrics</div>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {strategy.keyMetrics.map((metric) => (
                        <li key={metric} className="list-disc pl-4">
                          {metric}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-foreground">Core legs</div>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {strategy.legs.map((leg) => (
                        <li key={leg} className="list-disc pl-4">
                          {leg}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                    {strategy.marketView}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}
