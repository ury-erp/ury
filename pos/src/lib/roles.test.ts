import { describe, expect, it } from "vitest";
import { isCashierOnly } from "./roles";

describe("isCashierOnly", () => {
  it.each([
    [["URY Cashier"], true],
    [["URY Cashier", "Desk User", "All"], true],
    [["URY Cashier", "URY Manager"], false],
    [["URY Cashier", "URY Admin"], false],
    [["URY Cashier", "URY Owner"], false],
    [["URY Cashier", "System Manager"], false],
    [["URY Manager"], false],
    [["System Manager"], false],
    [[], false],
    [undefined, false],
  ])("%j -> %s", (roles, expected) => {
    expect(isCashierOnly(roles as string[] | undefined)).toBe(expected);
  });
});
