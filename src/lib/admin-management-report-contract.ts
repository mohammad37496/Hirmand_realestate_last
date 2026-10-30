/** Complete, stable report shape for an environment without a configured DB. */
export function emptyAdminManagementReport(days: number) {
  return {
    available: false as const,
    statusMessage: "پایگاه داده در دسترس نیست؛ گزارش مدیریتی بارگذاری نشد.",
    days,
    properties: { created: 0, published: 0, draft: 0, archived: 0 },
    leads: { created: 0, open: 0, contract: 0, closed: 0 },
    deals: { created: 0, completed: 0, contracted: 0, volume: 0, commission: 0 },
    finance: null,
    topConsultants: [] as Array<{ name: string; deals: number; volume: number }>,
  };
}
