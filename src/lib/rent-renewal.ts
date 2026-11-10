export type RentRenewalAmount = {
  previousAmount: number;
  increasePercent: number;
  increaseAmount: number;
  renewedAmount: number;
};

export function calculateRentRenewal(
  previousAmount: number,
  increasePercent: number,
): RentRenewalAmount | null {
  if (!Number.isFinite(previousAmount) || !Number.isFinite(increasePercent)) return null;
  if (previousAmount <= 0 || increasePercent < 0 || increasePercent > 1000) return null;
  const renewedAmount = Math.round(previousAmount * (1 + increasePercent / 100));
  return {
    previousAmount,
    increasePercent,
    increaseAmount: renewedAmount - previousAmount,
    renewedAmount,
  };
}
