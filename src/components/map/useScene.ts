"use client";
import { useCallback, useEffect, useState } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { readScenePref, writeScenePref, type Scene } from "./scene";
import { afterFilterUpdate } from "@/lib/state/filterHistory";
const parser = parseAsStringLiteral(["city", "flat"] as const);
export function useScene() {
  const [urlScene, setUrlScene] = useQueryState("scene", parser.withOptions({ history: "push", shallow: true }));
  const [issue] = useQueryState("issue");
  const [savedScene] = useState(readScenePref);
  const enabled = process.env.NEXT_PUBLIC_BUILDINGS_ENABLED !== "false";
  const scene = enabled ? urlScene ?? (issue ? "flat" : savedScene) : "flat";
  // Make the initial choice explicit in history before toggling, so Back and
  // refresh cannot reinterpret an absent scene using a subsequently changed preference.
  useEffect(() => {
    if (enabled && urlScene === null) void setUrlScene(issue ? "flat" : savedScene, { history: "replace" });
  }, [enabled, urlScene, savedScene, setUrlScene, issue]);
  const setScene = useCallback((next: Scene) => {
    afterFilterUpdate(() => { writeScenePref(next); void setUrlScene(next); });
  }, [setUrlScene]);
  return { scene, setScene, enabled };
}
