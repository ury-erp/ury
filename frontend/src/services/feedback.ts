import { call } from '@ury/core';

export interface FeedbackRow {
  name: string;
  branch: string;
  invoice: string | null;
  restaurant_table: string | null;
  submitted_at: string;
  served_by: string | null;
  source: string;
  overall: number;
  food: number | null;
  service: number | null;
  cleanliness: number | null;
  recommend_score: number | null;
  comment: string | null;
  contact_number: string | null;
  status: 'New' | 'Acknowledged' | 'Resolved';
  follow_up_notes: string | null;
}

export interface FeedbackSummary {
  responses: number;
  averages: Record<string, number | null>;
  /** null when nobody answered the recommendation question — not a score of zero. */
  nps: number | null;
  detractors: number;
  unanswered_detractors: number;
  with_comment: number;
  awaiting_contact: number;
  max_stars: number;
  max_recommend: number;
}

const unwrap = <T,>(res: any): T => res?.message ?? res;

export const feedbackService = {
  async list(params: { from_date?: string; status?: string; limit?: number } = {}): Promise<FeedbackRow[]> {
    return unwrap(await call('ury.ury.api.feedback.get_feedback', params));
  },

  async summary(from_date?: string): Promise<FeedbackSummary> {
    return unwrap(await call('ury.ury.api.feedback.get_feedback_summary', { from_date }));
  },

  async setStatus(feedback: string, status: string, follow_up_notes?: string): Promise<FeedbackRow> {
    return unwrap(
      await call('ury.ury.api.feedback.set_feedback_status', { feedback, status, follow_up_notes }),
    );
  },

  async card(): Promise<{ url: string; svg: string | null; branch: string }> {
    return unwrap(await call('ury.ury.api.feedback.get_branch_feedback_card'));
  },
};
