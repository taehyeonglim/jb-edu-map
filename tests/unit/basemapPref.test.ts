import { afterEach, describe, expect, it, vi } from "vitest";

import { readBasemapPref, writeBasemapPref } from "@/components/map/basemapPref";

/** Minimal Storage-shaped stub — good enough for `getItem`/`setItem`, which is all this module ever calls. */
function fakeStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn((k: string) => (k in store ? store[k] : null)),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    _store: store,
  };
}

describe("readBasemapPref/writeBasemapPref", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to 'night' when nothing is stored yet", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    expect(readBasemapPref()).toBe("night");
  });

  // Task 3 (bright diorama) — the pref used to be a boolean stored as "1"/"0"
  // (2차 개선 Task C). Those values must keep reading back as something
  // sensible for returning users, under the SAME storage key.
  it("migrates the old boolean values: '1' → satellite, '0' → off", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage({ "jbmap.basemap": "1" }) });
    expect(readBasemapPref()).toBe("satellite");
    vi.unstubAllGlobals();
    vi.stubGlobal("window", { localStorage: fakeStorage({ "jbmap.basemap": "0" }) });
    expect(readBasemapPref()).toBe("off");
  });

  it("reads the four modes back verbatim and falls back to night on garbage", () => {
    for (const mode of ["off", "night", "satellite", "base"] as const) {
      vi.stubGlobal("window", { localStorage: fakeStorage({ "jbmap.basemap": mode }) });
      expect(readBasemapPref()).toBe(mode);
      vi.unstubAllGlobals();
    }
    vi.stubGlobal("window", { localStorage: fakeStorage({ "jbmap.basemap": "midnight" }) });
    expect(readBasemapPref()).toBe("night");
  });

  it("write stores the mode string under 'jbmap.basemap' and reads back round-trip", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeBasemapPref("base");
    expect(storage.setItem).toHaveBeenCalledWith("jbmap.basemap", "base");
    expect(readBasemapPref()).toBe("base");

    writeBasemapPref("off");
    expect(storage.setItem).toHaveBeenCalledWith("jbmap.basemap", "off");
    expect(readBasemapPref()).toBe("off");
  });

  it("defaults to 'night' when localStorage.getItem throws (private-mode Safari etc.)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readBasemapPref()).toBe("night");
  });

  it("writeBasemapPref silently no-ops when localStorage.setItem throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => writeBasemapPref("off")).not.toThrow();
  });

  it("defaults to 'night' when window/localStorage is unavailable entirely (SSR-safety)", () => {
    vi.stubGlobal("window", undefined);
    expect(readBasemapPref()).toBe("night");
    expect(() => writeBasemapPref("off")).not.toThrow();
  });
});
