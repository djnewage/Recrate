import { useState, useEffect, useCallback } from 'react';
import { SpectralWaveformData } from '../types';

interface UseSpectralWaveformOptions {
  trackId: string | null;
  apiBaseUrl: string;
  sampleCount?: number;
  enabled?: boolean;
}

interface UseSpectralWaveformResult {
  data: SpectralWaveformData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for fetching spectral waveform data from the API
 */
export function useSpectralWaveform({
  trackId,
  apiBaseUrl,
  sampleCount = 800,
  enabled = true,
}: UseSpectralWaveformOptions): UseSpectralWaveformResult {
  const [data, setData] = useState<SpectralWaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchWaveform = useCallback(async () => {
    if (!trackId || !enabled) {
      setData(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const url = `${apiBaseUrl}/api/waveform/${trackId}/spectral?samples=${sampleCount}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const waveformData: SpectralWaveformData = await response.json();
      setData(waveformData);
    } catch (err) {
      console.warn(`Failed to fetch spectral waveform for ${trackId}:`, err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [trackId, apiBaseUrl, sampleCount, enabled]);

  useEffect(() => {
    fetchWaveform();
  }, [fetchWaveform]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchWaveform,
  };
}

export default useSpectralWaveform;
