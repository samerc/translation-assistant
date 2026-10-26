import { useState, useEffect } from 'react';

/** Current time (ms), refreshed every `intervalMs`, so relative times stay live without calling Date.now() during render. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
