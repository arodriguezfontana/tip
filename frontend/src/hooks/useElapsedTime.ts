import { useEffect, useState } from 'react';

export function useElapsedTime(createdAt: string): number {
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - new Date(createdAt).getTime());

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedMs(Date.now() - new Date(createdAt).getTime());
    }, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  return elapsedMs;
}
