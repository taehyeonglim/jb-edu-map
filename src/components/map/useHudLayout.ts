"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export interface HudRect { left: number; top: number; width: number; height: number }
export interface MapInsets { top: number; right: number; bottom: number; left: number }
export const EMPTY_INSETS: MapInsets = { top: 0, right: 0, bottom: 0, left: 0 };
export interface HudLayout { obstacles: HudRect[]; insets: MapInsets }

/** Measure actual controls, including opened settings/legend and translated panels. */
export function useHudLayout(container: RefObject<HTMLElement | null>) {
  const [layout, setLayout] = useState<HudLayout | null>(null);
  useLayoutEffect(() => {
    const map = container.current;
    const shell = map?.closest(".cyber-shell");
    if (!map || !shell) return;
    let frame = 0;
    const observed = new Set<Element>();
    const measure = () => {
      frame = 0;
      const bounds = map.getBoundingClientRect();
      const insets = { top: 12, left: 12, right: 12, bottom: 12 };
      const obstacles: HudRect[] = [];
      const current = new Set<Element>();
      shell.querySelectorAll<HTMLElement>("[data-map-obstacle], .deck-widget").forEach((element) => {
        current.add(element);
        if (!observed.has(element)) observer.observe(element);
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const left = Math.max(0, rect.left - bounds.left);
        const top = Math.max(0, rect.top - bounds.top);
        const right = Math.min(bounds.width, rect.right - bounds.left);
        const bottom = Math.min(bounds.height, rect.bottom - bounds.top);
        if (right <= left || bottom <= top) return;
        obstacles.push({ left, top, width: right - left, height: bottom - top });
        if (element.dataset.mapObstacle === "header") insets.top = bottom + 12;
        if (element.dataset.mapObstacle === "panel" && bounds.width >= 1024) insets.left = right + 12;
        if (element.dataset.mapObstacle === "legend") insets.bottom = bounds.height - top + 12;
      });
      for (const element of observed) if (!current.has(element)) observer.unobserve(element);
      observed.clear();
      for (const element of current) observed.add(element);
      const next = { insets, obstacles };
      setLayout((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    observer.observe(map);
    mutations.observe(shell, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    measure();
    window.addEventListener("resize", schedule);
    shell.addEventListener("animationend", schedule);
    return () => { observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); shell.removeEventListener("animationend", schedule); };
  }, [container]);
  return layout;
}

/** Prefer a nearby free rectangle; shrink into a scrollable card on small screens. */
export function placeSchoolHud(point: [number, number], size: { width: number; height: number }, card: { width: number; height: number }, obstacles: HudRect[]) {
  const margin = 12;
  const width = Math.min(card.width, size.width - margin * 2);
  const maxHeight = Math.min(card.height, 320, size.height - margin * 2);
  let best = { left: margin, top: margin, width, height: maxHeight, score: Infinity };
  for (let height = maxHeight; height >= Math.min(96, maxHeight); height -= 16) {
    const xs = [point[0] - width / 2, point[0] + 22, point[0] - width - 22, margin, size.width - width - margin,
      ...obstacles.flatMap((r) => [r.left - width - margin, r.left + r.width + margin])];
    const ys = [point[1] - height - 22, point[1] + 22, margin, size.height - height - margin,
      ...obstacles.flatMap((r) => [r.top - height - margin, r.top + r.height + margin])];
    for (const x of xs) for (const y of ys) {
      const left = Math.max(margin, Math.min(x, size.width - width - margin));
      const top = Math.max(margin, Math.min(y, size.height - height - margin));
      const overlap = obstacles.reduce((sum, r) => sum + Math.max(0, Math.min(left + width + 6, r.left + r.width) - Math.max(left - 6, r.left)) * Math.max(0, Math.min(top + height + 6, r.top + r.height) - Math.max(top - 6, r.top)), 0);
      const coversAnchor = point[0] >= left && point[0] <= left + width && point[1] >= top && point[1] <= top + height;
      const distance = Math.hypot(left + width / 2 - point[0], top + height / 2 - point[1]);
      const score = overlap * 10000 + (coversAnchor ? 5000 : 0) + distance + (maxHeight - height) * 4;
      if (score < best.score) best = { left, top, width, height, score };
    }
  }
  const stemX = Math.max(best.left + 8, Math.min(point[0], best.left + best.width - 8));
  const stemY = Math.max(best.top, Math.min(point[1], best.top + best.height));
  return { ...best, stemX, stemY };
}
