import { describe, expect, it } from "vitest";
import { formatCurrency, parsePrice } from "./price.js";

describe("parsePrice", () => {
  it('parses Czech format "12,50 Kč"', () => {
    expect(parsePrice("12,50 Kč")).toBe(12.5);
  });

  it("parses integer string", () => {
    expect(parsePrice("100")).toBe(100);
  });

  it('parses "46 Kč"', () => {
    expect(parsePrice("46 Kč")).toBe(46);
  });

  it("returns 0 for empty string", () => {
    expect(parsePrice("")).toBe(0);
  });

  it("returns 0 for garbage", () => {
    expect(parsePrice("abc")).toBe(0);
  });
});

describe("formatCurrency", () => {
  it("formats CZK whole number", () => {
    const result = formatCurrency(100, "cs", "CZK");
    expect(result).toContain("100");
    expect(result).toContain("Kč");
  });

  it("formats CZK decimal", () => {
    const result = formatCurrency(12.5, "cs", "CZK");
    expect(result).toContain("12");
    expect(result).toContain("Kč");
  });

  it("formats EUR", () => {
    const result = formatCurrency(42, "en", "EUR");
    expect(result).toContain("42");
    expect(result).toContain("€");
  });

  it("formats USD", () => {
    const result = formatCurrency(9.99, "en", "USD");
    expect(result).toContain("9");
    expect(result).toContain("$");
  });

  it("round-trips with parsePrice for CZK", () => {
    const formatted = formatCurrency(46, "cs", "CZK");
    expect(parsePrice(formatted)).toBe(46);
  });
});
