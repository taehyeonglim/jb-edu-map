import { expect, it, vi } from "vitest";
import { afterFilterUpdate, trackFilterUpdate } from "@/lib/state/filterHistory";

it("cancels deferred navigation when the user goes Back or Forward", async () => {
  const pending = Promise.withResolvers<URLSearchParams>();
  trackFilterUpdate(pending.promise);
  const navigate = vi.fn();
  afterFilterUpdate(navigate);
  window.dispatchEvent(new PopStateEvent("popstate"));
  pending.resolve(new URLSearchParams("q=전주"));
  await pending.promise;
  expect(navigate).not.toHaveBeenCalled();

  afterFilterUpdate(navigate);
  expect(navigate).toHaveBeenCalledOnce();
});

it("does not navigate after a failed filter write and allows later navigation", async () => {
  const pending = Promise.withResolvers<URLSearchParams>();
  trackFilterUpdate(pending.promise);
  const navigate = vi.fn();
  afterFilterUpdate(navigate);
  pending.reject(new Error("history write failed"));
  await pending.promise.catch(() => undefined);
  expect(navigate).not.toHaveBeenCalled();

  afterFilterUpdate(navigate);
  expect(navigate).toHaveBeenCalledOnce();
});
