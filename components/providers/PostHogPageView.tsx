'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || 'phc_d2wFkzuteiumc9nN1QtTlILnChyj30PbXuQiWMVeoFq';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

let posthogPromise: Promise<typeof import('posthog-js')> | null = null;
let posthogInitialized = false;

function scheduleIdle(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(callback, 1200);
  return () => globalThis.clearTimeout(id);
}

async function capturePageView(url: string) {
  posthogPromise ??= import('posthog-js');
  const posthog = (await posthogPromise).default;

  if (!posthogInitialized) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      autocapture: false,
      rageclick: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_performance: false,
      capture_dead_clicks: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_surveys_automatic_display: true,
      disable_product_tours: true,
      advanced_disable_flags: true,
      advanced_disable_decide: true,
    });
    posthogInitialized = true;
  }

  posthog.capture('$pageview', { $current_url: url });
}

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || !POSTHOG_KEY) return;

    let cancelled = false;
    let url = window.origin + pathname;
    if (searchParams?.toString()) {
      url = url + '?' + searchParams.toString();
    }

    const cancelIdle = scheduleIdle(() => {
      if (!cancelled) {
        void capturePageView(url);
      }
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [pathname, searchParams]);

  return null;
}

export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PageViewTracker />
    </Suspense>
  );
}
