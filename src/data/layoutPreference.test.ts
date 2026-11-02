import { describe, expect, it } from "vitest";
import { readLayout, saveLayout, swapLayout } from "./layoutPreference";

describe("layout preference", () => {
  it("defaults safely for invalid or duplicate entries", () => {
    expect(readLayout({ getItem: () => '["q1","q1","q3","q4"]' })).toEqual(["q1", "q2", "q3", "q4"]);
  });
  it("swaps entire quadrant identifiers and persists the order", () => {
    const stored: Record<string, string> = {};
    const order = swapLayout(["q1", "q2", "q3", "q4"], "q1", "q2");
    expect(order).toEqual(["q2", "q1", "q3", "q4"]);
    expect(saveLayout({ setItem: (key, value) => { stored[key] = value; } }, order)).toBe(true);
    expect(readLayout({ getItem: (key) => stored[key] })).toEqual(order);
  });
});
