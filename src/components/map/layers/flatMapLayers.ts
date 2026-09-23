import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { IssueMapModel } from "@/lib/issues/types";
import type { PickingInfo } from "@deck.gl/core";
import type { Feature, MultiPolygon, Polygon } from "geojson";

import type { RegionsFeatureCollection } from "@/lib/data/types";
import type { PositionedSchool } from "./schoolLayers";
import { SCHOOL_LEVEL_COLORS } from "@/lib/schoolVisuals";

/** Transparent picking surface and thin boundaries over the road map. */
export function makeFlatRegionsLayer(
  regions: RegionsFeatureCollection,
  selectedCode: string | null,
  onClick: (code: string, info?: PickingInfo<Feature<Polygon | MultiPolygon>>) => void,
  issueModel?: IssueMapModel | null,
) {
  return new GeoJsonLayer<NonNullable<RegionsFeatureCollection["features"][number]["properties"]>>({
    id: "regions",
    data: regions,
    extruded: false,
    filled: true,
    stroked: true,
    getFillColor: issueModel ? (feature) => issueModel.regions.find((row) => row.code === feature.properties.code)?.color ?? [255, 255, 255, 0] : [255, 255, 255, 0],
    getLineColor: (feature) =>
      feature.properties.code === selectedCode ? [131, 230, 239, 255] : [104, 144, 172, 190],
    getLineWidth: (feature) => feature.properties.code === selectedCode ? 2 : 1,
    lineWidthUnits: "pixels",
    pickable: true,
    autoHighlight: false,

    updateTriggers: { getFillColor: [issueModel], getLineColor: [selectedCode], getLineWidth: [selectedCode] },
    onClick: (info: PickingInfo<Feature<Polygon | MultiPolygon>>) => {
      const code = info.object?.properties?.code;
      if (code) onClick(code, info);
    },
  });
}

/** Fixed-size school dots anchored directly to their ground coordinates. */
export function makeFlatSchoolsLayer(
  schools: PositionedSchool[],
  highlightedId: string | null,
  onClick: (id: string) => void,
) {
  return new ScatterplotLayer<PositionedSchool>({
    id: "schools",
    data: schools,
    pickable: true,

    billboard: true,
    radiusUnits: "pixels",
    getRadius: 5,
    radiusMinPixels: 5,
    radiusMaxPixels: 5,
    stroked: true,
    lineWidthUnits: "pixels",
    getLineWidth: (school) => school.id === highlightedId ? 3 : 1.5,
    getLineColor: [8, 20, 33, 255],
    getFillColor: (school) => SCHOOL_LEVEL_COLORS[school.level],
    getPosition: (school) => [school.lng, school.lat, 1],
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    updateTriggers: { getLineWidth: [highlightedId] },
    onClick: (info) => {
      if (info.object) onClick(info.object.id);
    },
  });
}
