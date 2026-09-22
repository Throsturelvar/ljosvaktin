// Helpers that reproduce Python semantics the original API relied on,
// so JSON output stays identical to the Python Worker.

const HOUR = 3600 * 1000;
export { HOUR };

// Python round(): exact-binary rounding with ties to even.
export function pyRound(x, n = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return x;
  const neg = x < 0;
  const a = Math.abs(x);
  const exact = a.toFixed(20);
  const [intPart, frac = ""] = exact.split(".");
  const tail = frac.slice(n);
  let r;
  if (/^50*$/.test(tail)) {
    const digits = intPart + frac.slice(0, n);
    const last = Number(digits[digits.length - 1]);
    const base = Number(intPart + "." + frac.slice(0, n)) || Number(intPart);
    r = last % 2 === 0 ? base : base + Math.pow(10, -n);
    r = Number(r.toFixed(n));
  } else {
    r = Number(a.toFixed(n));
  }
  return neg ? -r : r;
}

// Python datetime.fromisoformat for aware strings ("Z" or "+00:00").
export function dt(value) {
  if (!value) return null;
  const ms = Date.parse(String(value).replace("Z", "+00:00"));
  return Number.isNaN(ms) ? null : ms;
}

// fromisoformat(...).replace(tzinfo=utc): read the wall-clock time as UTC.
export function naiveUtc(value) {
  if (typeof value !== "string") return null;
  const s = value.trim().replace(" ", "T").replace(/(Z|[+-]\d\d:?\d\d)$/, "");
  const ms = Date.parse(s + "Z");
  return Number.isNaN(ms) ? null : ms;
}

// datetime.isoformat() for UTC-aware values.
export function pyIso(ms) {
  if (ms === null || ms === undefined) return null;
  const iso = new Date(ms).toISOString();
  const frac = iso.slice(20, 23);
  const base = iso.slice(0, 19);
  return (frac === "000" ? base : `${base}.${frac}000`) + "+00:00";
}

export function hhmm(ms) {
  return new Date(ms).toISOString().slice(11, 16);
}

export function utcDateString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function dateStartMs(isoDate) {
  return Date.parse(isoDate + "T00:00:00Z");
}

// Python 3.12+ sum() on floats uses Neumaier compensated summation.
export function pySum(values) {
  let total = 0;
  let c = 0;
  for (const v of values) {
    const t = total + v;
    c += Math.abs(total) >= Math.abs(v) ? total - t + v : v - t + total;
    total = t;
  }
  return total + c;
}

export function mean(values) {
  if (!values.length) return null;
  return pySum(values) / values.length;
}
