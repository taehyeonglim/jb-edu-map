"use client";

import { useEffect, useRef, useState } from "react";

import { indicatorById } from "@/lib/indicators/registry";
import type { SeriesFile } from "@/lib/indicators/types";
import { displayLabel } from "@/lib/stats";
import { useMapQuery } from "@/lib/state/urlState";

import { METRIC_LABELS, PUBLISHED_ISSUES } from "@/lib/issues/registry";
import IndicatorPicker from "./IndicatorPicker";

export interface IndicatorMenuProps {
  /**
   * bundle.series, used only to compute students_change_5y's dynamic
   * "{minYear}→{maxYear}" label span via displayLabel() — matching what
   * Legend shows for the same indicator (see Dashboard.tsx's legendDef).
   * Optional and defaults to {} (displayLabel() falls back to the static
   * registry label when a series is unavailable), so this component stays
   * mountable/testable without a loaded data bundle, per the task brief's
   * test setup (only a nuqs testing adapter wrapper, no DataProvider).
   */
  series?: Record<string, SeriesFile>;
}

/**
 * Top-bar "조건별 맵" button + popover. Self-contained: reads/writes the
 * `indicator` URL param itself via useMapQuery(), so callers (TopBar) don't
 * need to prop-drill indicatorId/setIndicator through it.
 */
export default function IndicatorMenu({ series = {} }: IndicatorMenuProps) {
  const { indicatorId, setIndicator, issueId, issueMetric, setIssue } =
    useMapQuery();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Bridges an arrow-key move's synthetic click (see handlePopoverKeyDown /
  // handlePopoverClick below) so it isn't mistaken for a commit gesture.
  // Declared here (not next to the handlers that use it) so the lifecycle
  // effect below can reset it in its close/cleanup path: a stray keydown
  // can arm this flag without its paired click ever arriving before the
  // popover closes by some other route (Escape, outside click) — resetting
  // on every close is a safety net so that stale `true` can never survive
  // into the next open and swallow an unrelated later real click.
  const suppressNextClickRef = useRef(false);
  // Task 6, Section B — set by the toggle button's own onKeyDown (below)
  // whenever ENTER is what's about to activate it; read and reset by the
  // lifecycle effect immediately below on every `open` transition (opening
  // OR closing), so it can never survive stale into a later, differently-
  // triggered open.
  const openedByEnterRef = useRef(false);
  // Guards exactly the ONE stray radio keyup a KEYBOARD-Enter-triggered open
  // produces — see the effect body and handlePopoverKeyUp below for the full
  // mechanism.
  const suppressNextRadioKeyupRef = useRef(false);

  const def = indicatorById(indicatorId);
  const label =
    issueId && issueMetric
      ? METRIC_LABELS[issueMetric]
      : def
        ? displayLabel(def, series)
        : indicatorId;

  // Single effect, gated on `open`: the effect body runs the "just opened"
  // work (focus the first radio, attach ESC/outside-click listeners); its
  // cleanup — which React runs exactly when `open` flips back to false, or
  // on unmount — tears the listeners down and returns focus to the button.
  // Listeners are registered with `capture: true` so the deck.gl canvas's
  // own event manager (mjolnir.js), which can stop propagation on pointer
  // events, never prevents an outside click from reaching this handler.
  useEffect(() => {
    // Consumed on EVERY `open` transition (not just opening) so it can
    // never go stale — see openedByEnterRef's own doc comment.
    const openedByEnter = openedByEnterRef.current;
    openedByEnterRef.current = false;
    if (!open) return;

    // Captured once, up front — read fresh at cleanup time (weeks/renders
    // later, in general) a ref's `.current` might no longer point at the
    // node it did when the effect ran; snapshotting here keeps the
    // outside-click check and the close-time focus-restore pinned to the
    // exact button/popover this effect instance opened for.
    const popover = popoverRef.current;
    const button = buttonRef.current;

    const firstRadio = popover?.querySelector<HTMLInputElement>(
      'input[type="radio"]',
    );
    // Task 6, Section B (keyboard operability bug found via e2e/a11y.spec.ts,
    // confirmed with a precise keydown/keyup trace): a native <button>
    // fires its click on Enter's KEYDOWN (not keyup, unlike Space) — so
    // `firstRadio?.focus()` right below runs SYNCHRONOUSLY as part of
    // handling that same keydown, and the physical Enter key's still-
    // pending KEYUP then lands on the now-focused RADIO instead of the
    // button. Without this guard, handlePopoverKeyUp's "Enter/Space on a
    // radio commits and closes" rule (see its own comment) misreads that
    // stray keyup as a deliberate commit and instantly re-closes the menu
    // that literally just opened — every single keyboard-Enter open,
    // 100% reproducible. Space doesn't have this problem (its click fires
    // on the BUTTON's own keyup, by which point that key's full
    // keydown+keyup pair has already finished targeting the button, before
    // focus ever moves) — restricting this guard to the Enter-open case
    // specifically (openedByEnter) keeps every other keyup path (a mouse-
    // click-then-radio-Enter commit, a Space-opened menu, …) unaffected.
    if (firstRadio && openedByEnter) {
      suppressNextRadioKeyupRef.current = true;
    }
    firstRadio?.focus();

    function onKeyDown(event: KeyboardEvent) {
      // Fix round 1 (review finding #1): preventDefault() so DeckMap's
      // document-level Escape-to-deselect listener (registered in the
      // BUBBLE phase specifically so it always runs after THIS capture-phase
      // listener, regardless of which effect happened to attach first — see
      // DeckMap.tsx's own comment) can tell "the menu already handled this
      // Escape" apart from "nothing did," and skip deselecting the region.
      // A single Escape with the menu open must close only the menu.
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (popover?.contains(target) || button?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("mousedown", onPointerDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("mousedown", onPointerDown, {
        capture: true,
      });
      suppressNextClickRef.current = false;
      // Clears any UNCONSUMED suppression (e.g. the menu closed via Escape/
      // outside-click before the expected stray radio keyup ever arrived) —
      // otherwise it could wrongly survive into a later, mouse-opened
      // session and swallow a genuine radio Enter/Space commit there.
      suppressNextRadioKeyupRef.current = false;
      button?.focus();
    };
  }, [open]);

  // Applies live as the user arrows through the radios — closing is handled
  // separately, only on an explicit "commit" gesture (see below), per the
  // fix-round-1 ruling: arrowing must preview, not close.
  function handleChange(id: string) {
    setIndicator(id);
  }

  function isRadioInput(
    target: EventTarget | null,
  ): target is HTMLInputElement {
    return target instanceof HTMLInputElement && target.type === "radio";
  }

  // Native same-`name` radio-group arrow-key navigation moves focus to the
  // next/previous radio AND fires a `click` on it as part of activating the
  // new selection (confirmed empirically against this repo's installed
  // @testing-library/user-event, which mirrors real browser activation
  // behavior here — NOT the `change`-without-`click` behavior a first read
  // of the spec might suggest). That means a plain "close on any click
  // hitting a radio" handler cannot tell an arrow-key move apart from an
  // explicit click: both are `click` events on the target radio. The
  // suppressNextClickRef declared above bridges the two: the keydown
  // handler below sets it for exactly the one click an arrow key is about
  // to synthesize, and the click handler consumes it (clears it, does not
  // close) instead of treating it as a commit gesture.

  // A real mouse click on a radio (or on its wrapping <label> — the browser
  // re-dispatches a second click with target = the input via native
  // label-activation) closes the popover, unless it's the synthetic click
  // that just followed an arrow key (suppressed above).
  function handlePopoverClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!isRadioInput(event.target)) return;
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    setOpen(false);
  }

  function handlePopoverKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isRadioInput(event.target) && event.key.startsWith("Arrow")) {
      suppressNextClickRef.current = true;
    }
  }

  // Enter/Space close on keyUP, not keydown — found empirically while
  // writing this fix (see IndicatorMenu.test.tsx): closing moves focus back
  // to the button (the lifecycle effect's cleanup below), and if that
  // happens on keydown, the SAME physical key press's still-pending keyup
  // can land on the now-focused <button> instead of the radio — native
  // buttons treat both Enter and Space as activation keys too, so that
  // stray keyup silently re-opens the menu (confirmed via a temporary
  // console.log trace: open flips false→true within the same interaction).
  // Closing on keyup instead lets the radio's own full keydown+keyup pair
  // finish targeting the radio before focus ever moves. Enter never
  // dispatches a click on a bare radio (no <form> ancestor here for it to
  // submit), so it needs this explicit handler regardless; Space also
  // dispatches a native click, but relying on keyup here rather than that
  // click keeps both keys on the same safe, race-free path.
  function handlePopoverKeyUp(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      isRadioInput(event.target) &&
      (event.key === "Enter" || event.key === " ")
    ) {
      // Task 6, Section B — see the lifecycle effect's comment: this exact
      // keyup can be the trailing artifact of the SAME Enter press that
      // just opened the menu, not a real commit gesture.
      if (suppressNextRadioKeyupRef.current) {
        suppressNextRadioKeyupRef.current = false;
        return;
      }
      setOpen(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        // Fix round 2, finding 8 — this used to be unconditionally set to
        // "indicator-menu-popover", but that <div> only exists in the DOM
        // while `open` (see the conditional render below) — a dangling
        // IDREF (referencing an id that resolves to nothing at all) whenever
        // the menu was closed. Only set it once the referenced element
        // actually exists.
        aria-controls={open ? "indicator-menu-popover" : undefined}
        onKeyDown={(event) => {
          // Only Enter needs tracking here — see the lifecycle effect's
          // comment for exactly why Space doesn't have the same race.
          if (event.key === "Enter") openedByEnterRef.current = true;
        }}
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1.5 text-sm text-ink hover:bg-ink/10"
      >
        <span className="sm:hidden">전체 지표 ▾</span>
        <span className="hidden truncate sm:inline sm:max-w-none">{`전체 지표 · ${label} ▾`}</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          id="indicator-menu-popover"
          role="dialog"
          aria-label="전체 지표 선택"
          onClick={handlePopoverClick}
          onKeyDown={handlePopoverKeyDown}
          onKeyUp={handlePopoverKeyUp}
          className="fixed left-3 right-3 top-[112px] z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-xl sm:top-14 xl:absolute xl:left-auto xl:right-0 xl:top-full xl:w-[640px]"
        >
          <IndicatorPicker
            value={issueId ? "" : indicatorId}
            onChange={handleChange}
            series={series}
          />
          <section
            className="mt-3 border-t border-line pt-3"
            aria-label="교육문제 지표"
          >
            {PUBLISHED_ISSUES.map((issue) => (
              <fieldset key={issue.id} className="mb-3">
                <legend className="text-sm font-semibold">{issue.title}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {issue.metrics.map((metric) => (
                    <button
                      key={metric}
                      className="min-h-11 rounded border border-line px-3 text-xs aria-pressed:bg-accent-soft"
                      aria-pressed={
                        issueId === issue.id && issueMetric === metric
                      }
                      onClick={() => {
                        setIssue(issue.id, metric);
                        setOpen(false);
                      }}
                    >
                      {METRIC_LABELS[metric]}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
