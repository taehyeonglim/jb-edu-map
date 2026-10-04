/**
 * Fetches every file DataProvider needs and validates the result against
 * the indicator registry. No React import.
 */
import type { ClosedSchoolsFile } from "../closedSchools/types";
import { isRegionCode, PROVINCE_CODE, REGION_CODES } from "../geo/regions";
import { INDICATORS } from "../indicators/registry";
import type { IndicatorFile, Manifest, SeriesFile } from "../indicators/types";
import type { SchoolsFile } from "../schools/types";
import { valueMap } from "../stats";
import type { DataBundle, NeighborsFeatureCollection, RegionsFeatureCollection } from "./types";

// Narrower than `typeof fetch` (which also accepts URL/Request input) since
// every call site here always passes a plain string path — `fetch` itself
// still satisfies this type (a function accepting a wider input type is a
// valid substitute), and it lets tests inject a fetchImpl typed over plain
// strings without fighting the DOM lib's URL|RequestInfo union.
type FetchImpl = (url: string, options?: RequestInit) => Promise<Response>;

async function fetchJson<T>(fetchImpl: FetchImpl, url: string): Promise<T> {
  // Stable data URLs can still be fresh in the browser's hour-long cache
  // after deployment. Revalidate the whole bundle, as education-issues does,
  // so returning visitors do not mix old school/statistics files with new
  // issue facts. Conditional requests can reuse unchanged response bodies.
  const res = await fetchImpl(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`loadBundle: failed to fetch ${url} (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

/** Base geography/school data loads alongside the manifest-gated metrics. */
export async function loadBundle(fetchImpl: FetchImpl = fetch): Promise<DataBundle> {
  const base = Promise.all([
    fetchJson<RegionsFeatureCollection>(fetchImpl, "/data/regions.geojson"),
    fetchJson<NeighborsFeatureCollection>(fetchImpl, "/data/neighbors.geojson"),
    fetchJson<string>(fetchImpl, "/data/charset.json"),
    fetchJson<SchoolsFile>(fetchImpl, "/data/schools.json"),
    fetchJson<ClosedSchoolsFile>(fetchImpl, "/data/closed-schools.json"),
  ]);

  const metrics = (async () => {
    const manifest = await fetchJson<Manifest>(fetchImpl, "/data/manifest.json");
    const indicatorIds = INDICATORS.map((d) => d.id);

    // The app only ever fetches indicators it knows about (the static
    // registry) — it never derives its fetch list from the manifest. But the
    // manifest is the pipeline's own record of what it actually built, so
    // cross-check every registry id against it BEFORE issuing any
    // indicator/series fetch below. A registry id missing from the manifest
    // means the data build is stale relative to the registry (e.g. someone
    // added an indicator to registry.ts without re-running the pipeline);
    // fail loudly with the exact ids and the fix, instead of a confusing 404
    // (or a silently-undefined bundle entry) partway through the Promise.all
    // below. The reverse — a manifest id with no matching registry entry,
    // e.g. a retired indicator — is fine and deliberately not checked here.
    // Keep temporary data-update failures readable in the error UI. Detailed
    // build diagnostics belong in the console, not the user-facing message.
    const missingFromManifest = indicatorIds.filter((id) => !(id in manifest.indicators));
    if (missingFromManifest.length > 0) {
      console.error(
        `loadBundle: manifest.json 에 없는 지표: ${missingFromManifest.join(", ")} — npm run data:build 를 다시 실행하세요`,
      );
      throw new Error("데이터가 갱신 중입니다. 잠시 후 새로고침해 주세요.");
    }

    const seriesIds = INDICATORS.filter((d) => d.aggregate.kind !== "external").map((d) => d.id);

    const [indicatorFiles, seriesFiles] = await Promise.all([
      Promise.all(
        indicatorIds.map((id) => fetchJson<IndicatorFile>(fetchImpl, `/data/indicators/${id}.json`)),
      ),
      Promise.all(seriesIds.map((id) => fetchJson<SeriesFile>(fetchImpl, `/data/series/${id}.json`))),
    ]);

    const indicators: Record<string, IndicatorFile> = {};
    indicatorIds.forEach((id, i) => {
      indicators[id] = indicatorFiles[i];
    });

    const series: Record<string, SeriesFile> = {};
    seriesIds.forEach((id, i) => {
      series[id] = seriesFiles[i];
    });

    return { manifest, indicators, series };
  })();
  const [[regions, neighbors, charset, schools, closedSchools], { manifest, indicators, series }] = await Promise.all([base, metrics]);
  return { regions, neighbors, charset, manifest, schools, closedSchools, indicators, series };
}

/**
 * Validates a loaded bundle against the registry: every registered indicator
 * id has an indicator file, every indicator file has a (level-less) row for
 * all 14 시군 plus the 52000 (전북 전체) row, regions has exactly 14
 * features, and charset is non-empty. Throws one Error listing every problem
 * found (not just the first), so a broken data build fails with a complete
 * diagnosis instead of a game of whack-a-mole.
 */
export function assertBundle(bundle: DataBundle): void {
  const problems: string[] = [];

  for (const def of INDICATORS) {
    const file = bundle.indicators[def.id];
    if (!file) {
      problems.push(`missing indicators/${def.id}.json`);
      continue;
    }
    const map = valueMap(file);
    const missingRegions = REGION_CODES.filter((code) => !map.has(code));
    if (missingRegions.length > 0) {
      problems.push(`indicators/${def.id}.json is missing rows for: ${missingRegions.join(", ")}`);
    }
    if (!map.has(PROVINCE_CODE)) {
      problems.push(`indicators/${def.id}.json is missing the ${PROVINCE_CODE} (전북 전체) row`);
    }
  }

  if (bundle.regions.features.length !== REGION_CODES.length) {
    problems.push(
      `regions.geojson has ${bundle.regions.features.length} features, expected ${REGION_CODES.length}`,
    );
  }

  if (bundle.charset.length === 0) {
    problems.push("charset is empty");
  }

  if (bundle.schools.schools.length === 0) {
    problems.push("schools.json has 0 schools");
  } else {
    const badRegionSchools = bundle.schools.schools.filter((s) => !isRegionCode(s.regionCode));
    if (badRegionSchools.length > 0) {
      problems.push(
        `schools.json has ${badRegionSchools.length} school(s) with a regionCode outside the 14 시군: ` +
          badRegionSchools
            .slice(0, 5)
            .map((s) => `${s.name}(${s.regionCode})`)
            .join(", "),
      );
    }
  }

  // Task 5 — closed-schools.json: every row must resolve to one of the 14
  // 시군 (mirrors the schools.json regionCode check above). An empty row
  // list is NOT flagged as a problem here (unlike schools.json) — an
  // all-zero 폐교 dataset would be a legitimate, if surprising, real state.
  const badRegionClosedSchools = bundle.closedSchools.rows.filter((r) => !isRegionCode(r.regionCode));
  if (badRegionClosedSchools.length > 0) {
    problems.push(
      `closed-schools.json has ${badRegionClosedSchools.length} row(s) with a regionCode outside the 14 시군: ` +
        badRegionClosedSchools
          .slice(0, 5)
          .map((r) => `${r.name}(${r.regionCode})`)
          .join(", "),
    );
  }

  if (problems.length > 0) {
    throw new Error(`assertBundle: ${problems.length} problem(s) found:\n- ${problems.join("\n- ")}`);
  }
}
