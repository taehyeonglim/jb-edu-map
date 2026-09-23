"use client";

/**
 * Task 6, Section A.1/A.3 — decides whether to render the real 3D map or
 * MapFallback's table stand-in, and wraps whichever it picks in
 * MapErrorBoundary (so a render exception from deck.gl itself also falls
 * back to the table rather than crashing the whole page).
 *
 * `dynamic(..., { ssr: false })` is only allowed inside a 'use client' file,
 * which is why the deck.gl-importing DeckMap is loaded from here rather
 * than from a server component.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";

import type { DeckMapProps } from "./DeckMap";
import MapErrorBoundary from "./MapErrorBoundary";
import MapFallback from "./MapFallback";
import { useBundle } from "@/lib/data/DataProvider";

const DeckMap = dynamic<DeckMapProps>(() => import("./DeckMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-paper text-sm text-ink-muted">
      지도 준비 중
    </div>
  ),
});

/** Computed once and cached: WebGL2 support cannot change mid-session, so there's nothing to subscribe to. */
let cachedWebGL2Ok: boolean | null = null;
function hasWebGL2(): boolean {
  if (cachedWebGL2Ok !== null) return cachedWebGL2Ok;
  if (typeof document === "undefined") return true; // SSR uses the loading placeholder.
  try {
    cachedWebGL2Ok = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    cachedWebGL2Ok = false;
  }
  return cachedWebGL2Ok;
}
function subscribeNever(): () => void {
  return () => {};
}
function getWebGLServerSnapshot(): boolean {
  return true;
}

export default function MapShell(props: DeckMapProps) {
  const bundle = useBundle();

  // WebGL support is independent of screen width; mobile renders the same map.
  const webglOk = useSyncExternalStore(
    subscribeNever,
    hasWebGL2,
    getWebGLServerSnapshot,
  );

  // Both unsupported WebGL and render errors must retain school details.
  // Unlocated schools already use Dashboard's panel-based detail path.
  const fallbackProps = {
      issueModel: props.issueModel,
      indicatorId: props.indicatorId,
      bundle,
      selectedCode: props.selectedCode,
      onSelect: props.onSelect,
      selectedSchool: (props.schools ?? bundle.schools.schools).find((school) =>
        school.id === props.highlightedSchoolId && school.lat !== null && school.lng !== null) ?? null,
      onSchoolClose: () => props.onHighlightSchool(null),
      onSchoolStatistics: props.onSchoolStatistics,
  };

  let content: ReactNode;
  if (!webglOk) {
    content = <MapFallback {...fallbackProps} reason="webgl" />;
  } else {
    content = <DeckMap {...props} />;
  }

  return (
    <MapErrorBoundary
      fallback={<MapFallback {...fallbackProps} reason="error" />}
    >
      {content}
    </MapErrorBoundary>
  );
}
