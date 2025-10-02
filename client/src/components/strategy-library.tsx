import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "@/data/strategy-library";

import type { StrategyComplexity } from "@/data/strategy-library";

const COMPLEXITY_SEQUENCE: StrategyComplexity[] = ['beginner', 'intermediate', 'advanced'];

type ComplexityFilterValue = 'all' | StrategyComplexity;

type StrategyFilterValue = 'all' | string;

const riskTone: Record<StrategyDefinition['riskLevel'], string> = {
  Low: 'bg-emerald-100 text-emerald-900 border border-emerald-200',
  Medium: 'bg-amber-100 text-amber-900 border border-amber-200',
  High: 'bg-rose-100 text-rose-900 border border-rose-200',
};

export function StrategyLibrary() {
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

  return (
    <section className="space-y-6" data-testid="strategy-library">
      <Card className="p-6 space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Strategy Library</h2>
            <p className="text-sm text-muted-foreground">
              Browse option strategies by complexity, see key metrics at a glance, and compare core leg setups.
            </p>
          </div>
          <Badge variant="outline" className="text-sm font-medium">
            {filteredStrategies.length} strategy{filteredStrategies.length === 1 ? '' : ' cards'}
          </Badge>
        </header>

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
            {filteredStrategies.map((strategy) => (
              <Card key={strategy.id} className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      {COMPLEXITY_LABELS[strategy.complexity]}
                    </div>
                    <h3 className="text-lg font-semibold leading-tight">{strategy.name}</h3>
                  </div>
                  <Badge className={`${riskTone[strategy.riskLevel]} text-xs font-semibold`}>{strategy.riskLevel} risk</Badge>
                </div>

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
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
