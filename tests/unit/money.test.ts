import { describe, expect, it } from "vitest";
import { formatPct, formatUsd, fromCents, ratio, sumCents, toCents } from "@/lib/util/money";

describe("integer-cent arithmetic", () => {
  it("converts USD to cents without float drift", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1_798_772.34)).toBe(179_877_234);
    expect(toCents(154_399.34)).toBe(15_439_934);
    expect(toCents(5_593_800)).toBe(559_380_000);
    expect(toCents(0)).toBe(0);
    expect(fromCents(179_877_234)).toBe(1_798_772.34);
  });

  it("rejects non-finite amounts", () => {
    expect(() => toCents(Number.NaN)).toThrow(RangeError);
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("sums integer cents exactly and rejects fractional cents", () => {
    expect(sumCents([164_437_300, 15_439_934])).toBe(179_877_234);
    expect(sumCents([])).toBe(0);
    expect(() => sumCents([1, 1.5])).toThrow(RangeError);
    expect(() => sumCents([Number.MAX_SAFE_INTEGER + 2])).toThrow(RangeError);
  });

  it("returns null ratios when the denominator is zero or unknown", () => {
    expect(ratio(5, 10)).toBe(0.5);
    expect(ratio(5, 0)).toBeNull();
    expect(ratio(5, null)).toBeNull();
    expect(ratio(5, undefined)).toBeNull();
  });
});

describe("formatting", () => {
  it("shows cents whenever the amount is not whole dollars", () => {
    expect(formatUsd(179_877_234)).toBe("$1,798,772.34");
    expect(formatUsd(379_502_766)).toBe("$3,795,027.66");
    expect(formatUsd(559_380_000)).toBe("$5,593,800");
    expect(formatUsd(559_380_000, { precise: true })).toBe("$5,593,800.00");
    expect(formatUsd(5)).toBe("$0.05");
    expect(formatUsd(0)).toBe("$0");
  });

  it("formats compact amounts", () => {
    expect(formatUsd(559_380_000, { compact: true })).toBe("$5.59M");
    expect(formatUsd(2_000_000_000, { compact: true })).toBe("$20.0M");
    expect(formatUsd(1_500_000, { compact: true })).toBe("$15k");
    expect(formatUsd(150_000, { compact: true })).toBe("$1.5k");
    expect(formatUsd(50_000, { compact: true })).toBe("$500");
  });

  it("labels missing values as unavailable instead of zero", () => {
    expect(formatUsd(null)).toBe("Unavailable");
    expect(formatUsd(undefined)).toBe("Unavailable");
    expect(formatPct(null)).toBe("Unavailable");
    expect(formatPct(Number.NaN)).toBe("Unavailable");
    expect(formatPct(0.255)).toBe("25.5%");
    expect(formatPct(1 / 3, 2)).toBe("33.33%");
    expect(formatPct(0)).toBe("0.0%");
  });
});
