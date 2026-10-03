import { describe, expect, it, vi } from "vitest";

import { assertBundle, loadBundle } from "@/lib/data/load";
import type { DataBundle } from "@/lib/data/types";
import { INDICATORS, INDICATOR_IDS } from "@/lib/indicators/registry";
import { PROVINCE_CODE, REGION_CODES } from "@/lib/geo/regions";
import type { IndicatorFile, Manifest, SeriesFile } from "@/lib/indicators/types";
import type { SchoolsFile } from "@/lib/schools/types";
import type { ClosedSchoolsFile } from "@/lib/closedSchools/types";

function regionsFixture() {
  return {
    type: "FeatureCollection",
    features: REGION_CODES.map((code) => ({
      type: "Feature",
      properties: { code, name: code, bbox: [0, 0, 1, 1], labelPoint: [0.5, 0.5] },
      geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    })),
  };
}

function neighborsFixture() {
  return { type: "FeatureCollection", features: [] };
}

const CHARSET = "가나다0123456789";

function indicatorFileFixture(id: string): IndicatorFile {
  const def = INDICATORS.find((d) => d.id === id)!;
  return {
    id,
    year: 2026,
    referenceDate: "2026-04-01",
    source: def.source,
    rows: [...REGION_CODES.map((code) => ({ regionCode: code, value: 1 })), { regionCode: PROVINCE_CODE, value: 14 }],
  };
}

function seriesFileFixture(id: string): SeriesFile {
  return {
    id,
    rows: [2022, 2023, 2024, 2025, 2026].flatMap((year) => [
      ...REGION_CODES.map((code) => ({ regionCode: code, year, value: 1 })),
      { regionCode: PROVINCE_CODE, year, value: 14 },
    ]),
  };
}

function manifestFixture(): Manifest {
  const indicators: Manifest["indicators"] = {};
  for (const id of INDICATOR_IDS) indicators[id] = { years: [2022, 2023, 2024, 2025, 2026] };
  return { latestYear: 2026, indicators, builtAt: "2026-01-01T00:00:00.000Z", sources: [] };
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 404) {
  return { ok, status, json: async () => body } as Response;
}

function schoolsFixture(): SchoolsFile {
  return {
    referenceDate: { location: "2026-03-20", stats: "2026-04-01" },
    source: {
      location: { name: "한국교육시설안전원 초중등학교위치 표준데이터", url: "https://example.com/location", referenceDate: "2026-03-20" },
      stats: { name: "KESS", url: "https://example.com/kess", referenceDate: "2026-04-01" },
    },
    schools: REGION_CODES.map((code, i) => ({
      id: `S${i}`,
      name: `학교${i}`,
      level: "elem",
      status: "운영",
      branch: false,
      lat: 35.8,
      lng: 127.1,
      regionCode: code,
      students: 100,
      classes: 5,
      teachers: 10,
      studentsPerClass: 20,
      small: false,
    })),
  };
}

function closedSchoolsFixture(): ClosedSchoolsFile {
  return {
    referenceDate: "2026-07-16",
    publishedAt: "2026-07-20",
    source: { name: "전북특별자치도교육청 폐교재산 현황(공공데이터포털)", url: "https://example.com/closed-schools", year: 2026 },
    rows: REGION_CODES.map((code, i) => ({
      regionCode: code,
      name: `폐교${i}`,
      year: 2020,
      level: "elem",
      usage: "미활용",
      buildingArea: 100,
      siteArea: 200,
      address: "전북특별자치도 어딘가",
    })),
  };
}

/** A fetchImpl that resolves every URL this app's DataProvider is expected to request. */
function fullFakeFetch() {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string) => {
    calls.push(url);
    if (url === "/data/regions.geojson") return jsonResponse(regionsFixture());
    if (url === "/data/neighbors.geojson") return jsonResponse(neighborsFixture());
    if (url === "/data/charset.json") return jsonResponse(CHARSET);
    if (url === "/data/manifest.json") return jsonResponse(manifestFixture());
    if (url === "/data/schools.json") return jsonResponse(schoolsFixture());
    if (url === "/data/closed-schools.json") return jsonResponse(closedSchoolsFixture());
    const indicatorMatch = /^\/data\/indicators\/(.+)\.json$/.exec(url);
    if (indicatorMatch) return jsonResponse(indicatorFileFixture(indicatorMatch[1]));
    const seriesMatch = /^\/data\/series\/(.+)\.json$/.exec(url);
    if (seriesMatch) return jsonResponse(seriesFileFixture(seriesMatch[1]));
    throw new Error(`unexpected url ${url}`);
  });
  return { impl, calls };
}

describe("loadBundle", () => {
  it("starts validated metric requests before a slow geography response finishes", async () => {
    const { impl, calls } = fullFakeFetch();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const result = loadBundle(async url => {
      if (url === "/data/regions.geojson") await held;
      return impl(url);
    });
    await vi.waitFor(() => expect(calls).toContain("/data/indicators/students_total.json"));
    expect(calls).not.toContain("/data/regions.geojson");
    release();
    expect((await result).regions.features).toHaveLength(14);
  });
  it("fetches regions/neighbors/charset/manifest + every indicator/series file, returning a DataBundle", async () => {
    const { impl } = fullFakeFetch();
    const bundle = await loadBundle(impl);

    expect(bundle.regions.features).toHaveLength(14);
    expect(bundle.neighbors.type).toBe("FeatureCollection");
    expect(bundle.charset).toBe(CHARSET);
    expect(bundle.manifest.latestYear).toBe(2026);
    expect(bundle.schools.schools.length).toBe(REGION_CODES.length);
    expect(bundle.schools.referenceDate.location).toBe("2026-03-20");
    expect(bundle.closedSchools.rows.length).toBe(REGION_CODES.length);
    expect(bundle.closedSchools.referenceDate).toBe("2026-07-16");
    for (const id of INDICATOR_IDS) {
      expect(bundle.indicators[id]).toBeTruthy();
      expect(bundle.indicators[id].id).toBe(id);
    }
  });

  it("skips fetching a series file for external-kind indicators (students_change_5y)", async () => {
    const { impl, calls } = fullFakeFetch();
    const bundle = await loadBundle(impl);

    expect(calls).not.toContain("/data/series/students_change_5y.json");
    expect(bundle.series.students_change_5y).toBeUndefined();
    // But a normal (sum/ratio/count/share) indicator's series IS fetched.
    expect(calls).toContain("/data/series/students_total.json");
    expect(bundle.series.students_total).toBeTruthy();
  });

  it("throws the Korean user-facing message and logs developer diagnostics (missing ids, npm run data:build hint) to console.error separately, before fetching any indicator/series file", async () => {
    const manifest = manifestFixture();
    const missingId = INDICATOR_IDS[0];
    delete manifest.indicators[missingId];
    const calls: string[] = [];
    const impl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url === "/data/regions.geojson") return jsonResponse(regionsFixture());
      if (url === "/data/neighbors.geojson") return jsonResponse(neighborsFixture());
      if (url === "/data/charset.json") return jsonResponse(CHARSET);
      if (url === "/data/manifest.json") return jsonResponse(manifest);
      if (url === "/data/schools.json") return jsonResponse(schoolsFixture());
      if (url === "/data/closed-schools.json") return jsonResponse(closedSchoolsFixture());
      const indicatorMatch = /^\/data\/indicators\/(.+)\.json$/.exec(url);
      if (indicatorMatch) return jsonResponse(indicatorFileFixture(indicatorMatch[1]));
      const seriesMatch = /^\/data\/series\/(.+)\.json$/.exec(url);
      if (seriesMatch) return jsonResponse(seriesFileFixture(seriesMatch[1]));
      throw new Error(`unexpected url ${url}`);
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: Error | undefined;
    try {
      await loadBundle(impl);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).toBeDefined();
    // Fix round 2, finding 3 — the thrown Error's message is exactly the
    // user-facing string DataProvider's error UI shows (never developer-only
    // detail like ids or an npm command); those go to console.error instead,
    // where a developer debugging a stale-manifest deploy can still find
    // them (browser devtools console), but a real end user never sees them.
    expect(caught?.message).toBe("데이터가 갱신 중입니다. 잠시 후 새로고침해 주세요.");

    expect(consoleError).toHaveBeenCalledTimes(1);
    const loggedMessage = String(consoleError.mock.calls[0]?.[0]);
    expect(loggedMessage).toContain(missingId);
    expect(loggedMessage).toContain("manifest.json");
    expect(loggedMessage).toContain("data:build");

    expect(calls.filter((u) => u.startsWith("/data/indicators/"))).toHaveLength(0);
    expect(calls.filter((u) => u.startsWith("/data/series/"))).toHaveLength(0);

    consoleError.mockRestore();
  });

  it("does not throw when the manifest lists extra ids beyond the registry (registry ⊆ manifest is the only requirement)", async () => {
    const manifest = manifestFixture();
    manifest.indicators["some_retired_indicator"] = { years: [2020] };
    const impl = vi.fn(async (url: string) => {
      if (url === "/data/regions.geojson") return jsonResponse(regionsFixture());
      if (url === "/data/neighbors.geojson") return jsonResponse(neighborsFixture());
      if (url === "/data/charset.json") return jsonResponse(CHARSET);
      if (url === "/data/manifest.json") return jsonResponse(manifest);
      if (url === "/data/schools.json") return jsonResponse(schoolsFixture());
      if (url === "/data/closed-schools.json") return jsonResponse(closedSchoolsFixture());
      const indicatorMatch = /^\/data\/indicators\/(.+)\.json$/.exec(url);
      if (indicatorMatch) return jsonResponse(indicatorFileFixture(indicatorMatch[1]));
      const seriesMatch = /^\/data\/series\/(.+)\.json$/.exec(url);
      if (seriesMatch) return jsonResponse(seriesFileFixture(seriesMatch[1]));
      throw new Error(`unexpected url ${url}`);
    });

    await expect(loadBundle(impl)).resolves.toBeTruthy();
  });

  it("rejects when any request fails", async () => {
    const impl = vi.fn(async (url: string) => {
      if (url === "/data/regions.geojson") return jsonResponse(null, false);
      if (url === "/data/neighbors.geojson") return jsonResponse(neighborsFixture());
      if (url === "/data/charset.json") return jsonResponse(CHARSET);
      if (url === "/data/manifest.json") return jsonResponse(manifestFixture());
      if (url === "/data/schools.json") return jsonResponse(schoolsFixture());
      if (url === "/data/closed-schools.json") return jsonResponse(closedSchoolsFixture());
      const indicatorMatch = /^\/data\/indicators\/(.+)\.json$/.exec(url);
      if (indicatorMatch) return jsonResponse(indicatorFileFixture(indicatorMatch[1]));
      const seriesMatch = /^\/data\/series\/(.+)\.json$/.exec(url);
      if (seriesMatch) return jsonResponse(seriesFileFixture(seriesMatch[1]));
      throw new Error(`unexpected url ${url}`);
    });
    await expect(loadBundle(impl)).rejects.toThrow();
  });
});

describe("assertBundle", () => {
  async function validBundle(): Promise<DataBundle> {
    const { impl } = fullFakeFetch();
    return loadBundle(impl);
  }

  it("does not throw for a fully valid bundle", async () => {
    const bundle = await validBundle();
    expect(() => assertBundle(bundle)).not.toThrow();
  });

  it("throws listing a missing indicator file for a registered id", async () => {
    const bundle = await validBundle();
    delete bundle.indicators[INDICATOR_IDS[0]];
    expect(() => assertBundle(bundle)).toThrow(new RegExp(INDICATOR_IDS[0]));
  });

  it("throws when an indicator file is missing a 시군 row", async () => {
    const bundle = await validBundle();
    const id = INDICATOR_IDS[0];
    bundle.indicators[id] = {
      ...bundle.indicators[id],
      rows: bundle.indicators[id].rows.filter((r) => r.regionCode !== REGION_CODES[0]),
    };
    expect(() => assertBundle(bundle)).toThrow(new RegExp(id));
  });

  it("throws when an indicator file is missing the 52000 (전북 전체) row", async () => {
    const bundle = await validBundle();
    const id = INDICATOR_IDS[0];
    bundle.indicators[id] = {
      ...bundle.indicators[id],
      rows: bundle.indicators[id].rows.filter((r) => r.regionCode !== PROVINCE_CODE),
    };
    expect(() => assertBundle(bundle)).toThrow(new RegExp(id));
  });

  it("throws when regions has fewer than 14 features", async () => {
    const bundle = await validBundle();
    bundle.regions = { ...bundle.regions, features: bundle.regions.features.slice(0, 13) };
    expect(() => assertBundle(bundle)).toThrow(/14/);
  });

  it("throws when charset is empty", async () => {
    const bundle = await validBundle();
    bundle.charset = "";
    expect(() => assertBundle(bundle)).toThrow(/charset/i);
  });

  it("throws when schools.json has 0 schools", async () => {
    const bundle = await validBundle();
    bundle.schools = { ...bundle.schools, schools: [] };
    expect(() => assertBundle(bundle)).toThrow(/schools/i);
  });

  it("throws when a school's regionCode is outside the 14 시군", async () => {
    const bundle = await validBundle();
    bundle.schools = {
      ...bundle.schools,
      schools: [{ ...bundle.schools.schools[0], regionCode: "99999" }],
    };
    expect(() => assertBundle(bundle)).toThrow(/regionCode/);
  });

  it("throws when a closed-schools row's regionCode is outside the 14 시군", async () => {
    const bundle = await validBundle();
    bundle.closedSchools = {
      ...bundle.closedSchools,
      rows: [{ ...bundle.closedSchools.rows[0], regionCode: "99999" }],
    };
    expect(() => assertBundle(bundle)).toThrow(/regionCode/);
  });

  it("does not throw when closed-schools.json has 0 rows (a legitimate, if surprising, all-zero dataset)", async () => {
    const bundle = await validBundle();
    bundle.closedSchools = { ...bundle.closedSchools, rows: [] };
    expect(() => assertBundle(bundle)).not.toThrow();
  });

  it("reports multiple missing items in a single error", async () => {
    const bundle = await validBundle();
    delete bundle.indicators[INDICATOR_IDS[0]];
    delete bundle.indicators[INDICATOR_IDS[1]];
    try {
      assertBundle(bundle);
      throw new Error("expected assertBundle to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(new RegExp(INDICATOR_IDS[0]));
      expect(message).toMatch(new RegExp(INDICATOR_IDS[1]));
    }
  });
});
