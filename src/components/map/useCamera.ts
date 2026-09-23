"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { FlyToInterpolator, WebMercatorViewport } from "@deck.gl/core";
import { EMPTY_INSETS, type MapInsets } from "./useHudLayout";
import { unionBbox } from "@/lib/geo/geo";
import { fitOverview, fitRegion } from "./camera";
import { scenePitch, type Scene } from "./scene";
import type { RegionsFeatureCollection } from "@/lib/data/types";
import type { School } from "@/lib/schools/types";

/** Keep the interpolator and controller's zoom-derived pitch identical.
 * Changing pitch after interpolation would interrupt deck.gl's own flight. */
class SceneFlyToInterpolator extends FlyToInterpolator {
  constructor(private scene: Scene, private mobile: boolean) { super({ speed: 1.5 }); }
  override interpolateProps(...args: Parameters<FlyToInterpolator["interpolateProps"]>) {
    const view = super.interpolateProps(...args);
    return { ...view, pitch: scenePitch(this.scene, view.zoom, this.mobile), bearing: 0 };
  }
}

type OverviewViewState = ReturnType<typeof fitOverview>;
export type CameraViewState = OverviewViewState & {
  transitionInterpolator?: FlyToInterpolator;
  transitionDuration?: number | "auto";
  _nonce: number;
};

export function useCamera(
  containerRef: RefObject<HTMLDivElement | null>,
  regions: RegionsFeatureCollection,
  selectedCode: string | null,
  reduceMotion: boolean,
  selectedSchool: School | null = null,
  focusNonce = 0,
  scene: Scene = "city",
  mobile = false,
  insets: MapInsets | null = EMPTY_INSETS,
) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [cameraViewState, setCameraViewState] =
    useState<CameraViewState | null>(null);
  const [reselectNonce, setReselectNonce] = useState(0);
  const latest = useRef<CameraViewState | null>(null);
  const previous = useRef<{
    code: string | null;
    schoolId: string | null;
    focus: number;
    reselect: number;
    scene: Scene;
    mobile: boolean;
  } | null>(null);
  const sequence = useRef(0);
  const reselect = useCallback(() => setReselectNonce((n) => n + 1), []);
  const rememberViewState = useCallback((view: Record<string, unknown>) => {
    latest.current = { ...latest.current, ...view } as CameraViewState;
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0)
        setSize((old) =>
          old?.width === width && old?.height === height
            ? old
            : { width, height },
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  const overview = useMemo(
    () =>
      size && insets
        ? fitOverview(
            unionBbox(regions.features),
            regions.features.map((f) => f.properties.labelPoint),
            { width: Math.max(160, size.width - insets.left - insets.right), height: Math.max(160, size.height - insets.top - insets.bottom) },
            "road",
          )
        : null,
    [size, regions, insets],
  );

  const frameView = useCallback((target: OverviewViewState, school = false) => {
    if (!size || !insets) return target;
    const pitch = scenePitch(scene, target.zoom, mobile);
    const viewport = new WebMercatorViewport({ ...target, ...size, pitch, bearing: 0 });
    const availableHeight = Math.max(80, size.height - insets.top - insets.bottom);
    const x = insets.left + (size.width - insets.left - insets.right) / 2;
    const y = insets.top + availableHeight * (school ? .65 : .5);
    return { ...target, ...viewport.panByPosition([target.longitude, target.latitude], [x, y]), pitch };
  }, [size, insets, scene, mobile]);

  const framedOverview = useMemo(() => overview ? frameView(overview) : null, [overview, frameView]);

  useEffect(() => {
    if (!size || !overview || !insets) return;
    const before = previous.current;
    const current = latest.current;
    let target: OverviewViewState | CameraViewState | null = null;
    if (
      (!before || before.focus !== focusNonce || before.schoolId !== (selectedSchool?.id ?? null)) &&
      selectedSchool?.lat != null &&
      selectedSchool.lng != null
    ) {
      const maxZoom = 18;
      target = {
        ...overview,
        longitude: selectedSchool.lng,
        latitude: selectedSchool.lat,
        zoom: Math.min(maxZoom, Math.max(current?.zoom ?? 0, 16)),
      };
    } else if (
      !before ||
      before.code !== selectedCode ||
      before.reselect !== reselectNonce
    ) {
      const region = regions.features.find(
        (f) => f.properties.code === selectedCode,
      );
      target = region
        ? fitRegion(region.properties.bbox, { width: Math.max(160, size.width - insets.left - insets.right), height: Math.max(160, size.height - insets.top - insets.bottom) }, { mode: "road" })
        : overview;
    }
    const sceneOnly = !target && current && (before?.scene !== scene || before?.mobile !== mobile);
    if (sceneOnly) target = current;
    previous.current = {
      scene, mobile,
      schoolId: selectedSchool?.id ?? null,
      code: selectedCode,
      focus: focusNonce,
      reselect: reselectNonce,
    };
    if (!target) return;
    const next: CameraViewState = {
      ...(sceneOnly ? target : frameView(target, !!selectedSchool)),
      pitch: scenePitch(scene, target.zoom, mobile),
      bearing: 0,
      transitionInterpolator: new SceneFlyToInterpolator(scene, mobile),
      transitionDuration: reduceMotion || !current ? 0 : 550,
      _nonce: ++sequence.current,
    };
    latest.current = next;
    setCameraViewState(next);
  }, [
    size,
    overview,
    regions,
    selectedCode,
    selectedSchool,
    focusNonce,
    reselectNonce,
    reduceMotion,
    scene, mobile, insets, frameView,
  ]);

  return { overview: framedOverview, cameraViewState, reselect, rememberViewState };
}
