import TopBar from "@/components/panels/TopBar";
import { DEFAULT_INDICATOR_ID } from "@/lib/indicators/registry";

/**
 * The <Suspense> fallback for Dashboard in app/page.tsx. nuqs's useMapQuery()
 * (used inside Dashboard) calls useSearchParams() under the hood, which
 * requires a Suspense boundary above it for `next build`'s static
 * prerendering — this is the static shell Next renders in that gap, before
 * Dashboard itself takes over client-side.
 *
 * Layout skeleton only, no data: reuses TopBar with `bundle={null}`
 * (its own loading state — indicator menu + KPI tiles render as skeleton
 * bars) rather than duplicating that markup here. `indicatorId` is never
 * displayed in the bundle-less state, so any valid id works.
 */
export default function DashboardSkeleton() {
  return (
    <div className="cyber-shell bg-paper text-ink">
      <TopBar indicatorId={DEFAULT_INDICATOR_ID} bundle={null} />
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">지도 준비 중</div>
    </div>
  );
}
