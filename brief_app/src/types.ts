export interface Point { label: string; value: number; value_text?: string }
export interface Chart { type: string; series: Point[] }
export interface Slide {
  id: string;
  title: string;
  headline: string;
  value?: number | null;
  value_text?: string;
  compare?: number | null;
  delta_pct?: number | null;
  delta_label?: string | null;
  tone?: "good" | "bad" | "neutral";
  orders?: number | null;
  orders_compare?: number | null;
  chart?: Chart;
  drill?: string | null;
  data_quality?: string;
  status?: string;
  top?: Point[];
  bottom?: Point[];
}
export interface Brief {
  schema_version?: number;
  as_of: string;
  date?: string;
  currency?: string;
  locale?: string;
  scope?: { companies: string[]; branches: string[]; note?: string };
  features?: { huf?: boolean; voice_call?: boolean };
  slides: Slide[];
}
