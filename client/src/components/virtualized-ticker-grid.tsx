import { FixedSizeGrid as Grid } from 'react-window';
import { TickerCard } from './ticker-card';
import type { TickerWithPosition } from '@shared/schema';
import { useMemo } from 'react';

interface VirtualizedTickerGridProps {
  tickers: TickerWithPosition[];
  onViewOptions?: (symbol: string) => void;
  onViewVolatilitySurface?: (symbol: string) => void;
}

// Grid item component for react-window
const GridItem = ({ 
  columnIndex, 
  rowIndex, 
  style, 
  data 
}: {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
  data: {
    tickers: TickerWithPosition[];
    columnsPerRow: number;
    onViewOptions?: (symbol: string) => void;
    onViewVolatilitySurface?: (symbol: string) => void;
  };
}) => {
  const { tickers, columnsPerRow, onViewOptions, onViewVolatilitySurface } = data;
  const index = rowIndex * columnsPerRow + columnIndex;
  const ticker = tickers[index];

  // Don't render if no ticker for this position
  if (!ticker) {
    return <div style={style} />;
  }

  return (
    <div style={{ ...style, padding: '12px' }}>
      <TickerCard
        ticker={ticker}
        onViewOptions={onViewOptions}
        onViewVolatilitySurface={onViewVolatilitySurface}
      />
    </div>
  );
};

export function VirtualizedTickerGrid({ 
  tickers, 
  onViewOptions, 
  onViewVolatilitySurface 
}: VirtualizedTickerGridProps) {
  
  // Calculate grid dimensions
  const { columnsPerRow, rowCount, containerHeight } = useMemo(() => {
    // Responsive columns based on screen size
    const getColumnsPerRow = () => {
      if (typeof window === 'undefined') return 2;
      
      if (window.innerWidth >= 1536) return 3; // 2xl screens
      if (window.innerWidth >= 1280) return 2; // xl screens  
      if (window.innerWidth >= 1024) return 2; // lg screens
      return 1; // smaller screens
    };

    const columnsPerRow = getColumnsPerRow();
    const rowCount = Math.ceil(tickers.length / columnsPerRow);
    
    // Calculate container height based on number of rows
    const cardHeight = 600; // Approximate height of each ticker card
    const padding = 24; // Padding between cards
    const maxVisibleRows = 3; // Show max 3 rows at once
    const visibleRows = Math.min(rowCount, maxVisibleRows);
    const containerHeight = visibleRows * (cardHeight + padding);

    return { columnsPerRow, rowCount, containerHeight };
  }, [tickers.length]);

  // Prepare data for Grid component
  const gridData = useMemo(() => ({
    tickers,
    columnsPerRow,
    onViewOptions,
    onViewVolatilitySurface
  }), [tickers, columnsPerRow, onViewOptions, onViewVolatilitySurface]);

  // Handle empty state
  if (tickers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">
          No active tickers. Use the search above to add some tickers to get started.
        </p>
      </div>
    );
  }

  // For small numbers of tickers, use regular grid (no virtualization overhead)
  if (tickers.length <= 10) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {tickers.map((ticker) => (
          <TickerCard
            key={ticker.id}
            ticker={ticker}
            onViewOptions={onViewOptions}
            onViewVolatilitySurface={onViewVolatilitySurface}
          />
        ))}
      </div>
    );
  }

  // Use virtualization for large numbers of tickers
  return (
    <div className="w-full">
      <div className="mb-4 text-sm text-muted-foreground">
        Showing {tickers.length} positions with optimized rendering
      </div>
      
      <Grid
        columnCount={columnsPerRow}
        columnWidth={500} // Approximate width of each card
        height={containerHeight}
        rowCount={rowCount}
        rowHeight={624} // Card height + padding
        itemData={gridData}
        className="ticker-grid"
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          background: '#fafafa'
        }}
      >
        {GridItem}
      </Grid>
      
      {rowCount > 3 && (
        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground">
            Scroll to see more positions • {tickers.length} total
          </p>
        </div>
      )}
    </div>
  );
}
