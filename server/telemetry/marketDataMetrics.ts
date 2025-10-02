interface MarketDataMetric {
  event: 'cache_hit' | 'cache_stale_hit' | 'fetch_success' | 'fetch_error';
  endpoint: string;
  latencyMs?: number;
  statusCode?: number;
  cacheAgeMs?: number;
  error?: string;
  timestamp?: number;
}

const subscribers = new Set<(metric: MarketDataMetric) => void>();

export function recordMarketDataMetric(metric: MarketDataMetric): void {
  const enrichedMetric = {
    ...metric,
    timestamp: metric.timestamp ?? Date.now(),
  };

  for (const handler of subscribers) {
    try {
      handler(enrichedMetric);
    } catch (error) {
      console.error('[MarketData][Telemetry] subscriber error', error);
    }
  }

  if (process.env.MARKETDATA_TELEMETRY_LOG === 'true') {
    console.info('[MarketData][Telemetry]', enrichedMetric);
  }
}

export function subscribeToMarketDataMetrics(handler: (metric: MarketDataMetric) => void): () => void {
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
}
