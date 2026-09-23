import { TileLayer, _Tileset2D as Tileset2D } from "@deck.gl/geo-layers";
import { GeoJsonLayer } from "@deck.gl/layers";
import { ClipExtension, type ClipExtensionProps } from "@deck.gl/extensions";
import type { BuildingProperties, BuildingTile } from "@/lib/buildings/types";
import { BUILDING_EXTENT } from "@/lib/buildings/tiles";

/** Fixed-zoom tiles have no fallback parents: cancel every offscreen request immediately. */
export class BuildingTileset extends Tileset2D {
  override update(...args: Parameters<Tileset2D["update"]>): number {
    const frame = super.update(...args);
    for (const tile of this.tiles) {
      if (!tile.isSelected && tile.isLoading) tile.abort();
    }
    return frame;
  }
}

const extensions = [new ClipExtension()];
export function makeBuildingLayer(options: {
  mobile: boolean; issueActive: boolean; retry: number;
  onStatus: (id: string, error: boolean, fetchedAt?: string) => void;
}) {
  return new TileLayer<BuildingTile>({
    id: `buildings-${options.retry}`,
    TilesetClass: BuildingTileset,
    minZoom: 16, maxZoom: 16, tileSize: 512, extent: BUILDING_EXTENT,
    visibleMinZoom: options.mobile ? 16 : 15.5,
    maxRequests: options.mobile ? 2 : 4,
    maxCacheSize: options.mobile ? 32 : 64,
    maxCacheByteSize: (options.mobile ? 24 : 64) * 1024 * 1024,
    refinementStrategy: "no-overlap",
    pickable: false,
    // Rebuild only the sublayers when the issue overlay changes; retain tile data.
    updateTriggers: { getFillColor: options.issueActive },
    getTileData: async ({ index, signal, id }) => {
      try {
        const response = await fetch(`/api/buildings/v1/16/${index.x}/${index.y}`, { signal });
        if (!response.ok) throw new Error("Building tile unavailable");
        const raw = await response.text();
        const tile = JSON.parse(raw) as BuildingTile;
        if (tile.type !== "FeatureCollection" || !tile.metadata?.complete || !Array.isArray(tile.features)) throw new Error("Incomplete building tile");
        // Conservative decoded-data budget, distinct from GPU memory.
        tile.byteLength = raw.length * 4;
        if (!signal?.aborted) options.onStatus(id, false, tile.metadata.fetchedAt);
        return tile;
      } catch (error) {
        if (!signal?.aborted) options.onStatus(id, true);
        throw error;
      }
    },
    onTileError: () => {},
    onTileUnload: (tile) => options.onStatus(tile.id, false),
    renderSubLayers: (props) => {
      if (!props.data) return null;
      const [[west, south], [east, north]] = props.tile.boundingBox;
      const common = {
        ...props, data: props.data, pickable: false,
        extensions, clipBounds: [west, south, east, north] as [number, number, number, number], clipByInstance: false,
        getFillColor: [57, 115, 144, options.issueActive ? 76 : 96] as [number, number, number, number],
        getLineColor: [84, 175, 204, 140] as [number, number, number, number],
        lineWidthUnits: "pixels" as const, getLineWidth: 1,
        parameters: { depthWriteEnabled: false },
      };
      return [
        new GeoJsonLayer<BuildingProperties, ClipExtensionProps>(common, {
          id: `${props.id}-volume`, data: props.data.features.filter((f) => f.properties.displayHeight > 0),
          extruded: true, stroked: false, getElevation: (f) => f.properties.displayHeight,
          material: { ambient: 0.65, diffuse: 0.45, shininess: 8, specularColor: [30, 30, 30] },
        }),
        new GeoJsonLayer<BuildingProperties, ClipExtensionProps>(common, {
          id: `${props.id}-outline`, data: props.data.features.filter((f) => f.properties.displayHeight === 0),
          extruded: false, filled: false, stroked: true,
        }),
      ];
    },
  });
}
