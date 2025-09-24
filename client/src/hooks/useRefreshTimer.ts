import { useState, useEffect } from 'react';

export function useRefreshTimer(intervalMinutes: number = 15) {
  const [timeUntilRefresh, setTimeUntilRefresh] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const intervalMs = intervalMinutes * 60 * 1000; // 15 minutes in milliseconds
      
      // Calculate time since the last 15-minute boundary
      const timeSinceLastInterval = now % intervalMs;
      
      // Calculate time until next 15-minute boundary
      const timeUntilNext = intervalMs - timeSinceLastInterval;
      
      setTimeUntilRefresh(Math.floor(timeUntilNext / 1000)); // Convert to seconds
      
      // Set refreshing state if we're very close to refresh time (within 10 seconds)
      setIsRefreshing(timeUntilNext <= 10000);
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [intervalMinutes]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return {
    timeUntilRefresh,
    formattedTime: formatTime(timeUntilRefresh),
    isRefreshing,
  };
}