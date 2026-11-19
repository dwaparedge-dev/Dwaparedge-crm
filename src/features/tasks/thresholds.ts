/** The numbers the task rules share, in one place so the sync, the Desk and the badge cannot drift apart. */
export const THRESHOLDS = {
  /** A licence gets a renewal task once its expiry is within this many days (or already past). */
  renewalDays: 30,
  /** A sale milestone gets a billing task once it is due within this many days (or already past). */
  milestoneDays: 7,
  /** A task followed up this many times without closing is shown as Stuck. */
  stuckAfter: 3,
} as const;
