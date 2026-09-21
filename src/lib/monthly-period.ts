/** Monthly usage windows are UTC billing anniversaries, not payment terms. */
export type MeteredSubscription = {
  renewalAt: Date;
  termMonths: number;
  usageAnchorAt?: Date | null;
  usagePeriodStart?: Date | null;
  usagePeriodEnd?: Date | null;
};

export function shiftUtcMonth(anchor: Date, months: number): Date {
  if (!Number.isFinite(anchor.getTime()) || !Number.isSafeInteger(months)) {
    throw new Error("Invalid monthly billing boundary");
  }
  const result = new Date(anchor);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  if (!Number.isFinite(result.getTime())) throw new RangeError("Monthly boundary is outside the Date range");
  const monthEnd = new Date(result);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  if (!Number.isFinite(monthEnd.getTime())) throw new RangeError("Monthly boundary is outside the Date range");
  result.setUTCDate(Math.min(anchor.getUTCDate(), monthEnd.getUTCDate()));
  return result;
}

export function usageAnchor(subscription: MeteredSubscription | null, now = new Date()): Date {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid metering time");
  if (!subscription) {
    const start = new Date(now);
    start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
    return start;
  }
  if (subscription.usageAnchorAt) {
    const anchor = new Date(subscription.usageAnchorAt);
    if (!Number.isFinite(anchor.getTime())) throw new Error("Invalid metering anchor");
    return anchor;
  }
  const months = [1, 3, 6, 12].includes(subscription.termMonths) ? subscription.termMonths : 1;
  return shiftUtcMonth(subscription.renewalAt, -months);
}

/** Recompute from the anchor each time: Jan 31 -> Feb 28 -> Mar 31, without drift. */
export function monthlyWindow(subscription: MeteredSubscription | null, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid metering time");
  const anchor = usageAnchor(subscription, now);
  let offset = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + now.getUTCMonth() - anchor.getUTCMonth();
  if (shiftUtcMonth(anchor, offset) > now) offset--;
  const start = shiftUtcMonth(anchor, offset);
  const end = shiftUtcMonth(anchor, offset + 1);
  return { anchor, start, end, key: start.toISOString() };
}

export function periodStart(subscription: MeteredSubscription | null, now = new Date()): Date {
  return monthlyWindow(subscription, now).start;
}

/** Calendar key for reporting; reservations use the full anniversary timestamp. */
export function periodKey(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid metering time");
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
