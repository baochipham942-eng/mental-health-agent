'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ProgressTimeline } from '@/lib/ai/progress/tracker';

/**
 * 情绪趋势数据获取 Hook
 */
export function useEmotionTrend(days: 7 | 30 = 7) {
  const [data, setData] = useState<ProgressTimeline | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/progress?days=${days}`);
      if (res.status === 401) {
        // 未登录，不是错误
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}
