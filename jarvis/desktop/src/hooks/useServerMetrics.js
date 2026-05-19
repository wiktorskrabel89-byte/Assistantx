import { useEffect, useState } from 'react';

export function useServerMetrics(serverApi) {
  const [state, setState] = useState({
    cpu: 0,
    vram: 0,
    ram: 0,
    diskFree: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!serverApi) {
      setState((prev) => ({ ...prev, loading: false, error: 'server-api-unavailable' }));
      return undefined;
    }

    let disposed = false;

    async function pull() {
      try {
        const status = await serverApi.getStatus();
        if (!status?.connected) {
          if (!disposed) {
            setState((prev) => ({ ...prev, loading: false, error: null }));
          }
          return;
        }
        const metrics = await serverApi.execTool('get_metrics', {});
        if (disposed || !metrics) return;
        setState({
          cpu: Number(metrics.cpu || 0),
          vram: Number(metrics.vram || 0),
          ram: Number(metrics?.ram?.percent || 0),
          diskFree: Number(metrics?.disk?.free || 0),
          loading: false,
          error: null,
        });
      } catch (error) {
        if (!disposed) {
          setState((prev) => ({ ...prev, loading: false, error: error?.message || 'metrics-fetch-failed' }));
        }
      }
    }

    void pull();
    const timer = setInterval(() => void pull(), 1000);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [serverApi]);

  return state;
}
