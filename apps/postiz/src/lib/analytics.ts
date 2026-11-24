/** One metric as Postiz returns it from both analytics endpoints. */
export interface AnalyticsMetric {
  label?: string;
  data?: Array<{ total?: string | number; date?: string }>;
  percentageChange?: number;
}

/** Curates the analytics answer: label, total per date and percentage change. */
export function shapeAnalytics(metrics: AnalyticsMetric[] | undefined) {
  return (Array.isArray(metrics) ? metrics : []).map((metric) => ({
    label: metric.label ?? '',
    data: (metric.data ?? []).map((point) => ({ date: point.date ?? '', total: point.total })),
    percentageChange: metric.percentageChange ?? null,
  }));
}
