import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { IconLayer } from "@deck.gl/layers";
import type { Device } from "@luma.gl/core";
import type { MapMetricSpec } from "@/lib/mapMetrics";
import { METRIC_RAMP } from "@/lib/mapMetrics";
import type { PositionedSchool } from "./schoolLayers";

export function supportsDensity(device: Device): boolean {
  return (
    device.features.has("float32-renderable-webgl") &&
    device.features.has("texture-blend-float-webgl")
  );
}

export function makeDensityLayer(
  schools: PositionedSchool[],
  metric: MapMetricSpec,
  mobile: boolean,
) {
  return new HeatmapLayer<PositionedSchool>({
    id: "education-density",
    data: schools,
    getPosition: (s) => [s.lng, s.lat],
    getWeight: (s) => metric.value(s) ?? 0,
    radiusPixels: 60,
    aggregation: "SUM",
    // Fixed province-wide reference, never the maximum inside the viewport.
    colorDomain: [
      Math.max(1, metric.maximum) / 5000,
      Math.max(1, metric.maximum) / 100,
    ],
    colorRange: METRIC_RAMP.map(
      (c) => c.slice(0, 3) as [number, number, number],
    ),
    weightsTextureSize: mobile ? 512 : 1024,
    debounceTimeout: 200,
    pickable: false,
    updateTriggers: { getWeight: [metric] },
  });
}

const DIAMOND = {
  url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="white" d="M16 1 31 16 16 31 1 16Z"/></svg>')}`,
  width: 32,
  height: 32,
  mask: true,
};

export function makeSpecialSchoolLayer(
  schools: PositionedSchool[],
  metric: MapMetricSpec,
  onClick: (id: string) => void,
) {
  return new IconLayer<PositionedSchool>({
    id: "schools-special",
    data: schools.filter((s) => s.level === "special"),
    getIcon: () => DIAMOND,
    getPosition: (s) => [s.lng, s.lat, 2],
    getColor: metric.kind === "region" ? [176,185,255,255] : (s) => metric.value(s) === null ? [176,185,255,255] : metric.color(s),
    getSize: 16,
    sizeUnits: "pixels",
    billboard: true,
    pickable: true,
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    updateTriggers: { getColor: [metric] },
    onClick: (info) => {
      if (info.object) onClick(info.object.id);
    },
  });
}
