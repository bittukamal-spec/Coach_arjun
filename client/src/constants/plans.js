// Arjun Premium prices shown on the public website (founder, Nov 2026):
// monthly is priced high on purpose so the yearly plan is the clear choice.
// The in-app checkout charges whatever the Razorpay plans in the server env
// say — keep the two in step when the Razorpay plans change.
export const PLAN_PRICES = {
  monthly: 500,
  yearly: 2500,
};

export function formatRupees(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

export const yearlyPerMonth = () => Math.round(PLAN_PRICES.yearly / 12);
export const yearlySavingPct = () =>
  Math.round((1 - PLAN_PRICES.yearly / (PLAN_PRICES.monthly * 12)) * 100);
