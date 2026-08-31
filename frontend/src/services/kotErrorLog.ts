import { call } from "@ury/core";

export interface KotErrorLogRow {
  kot: string;
  invoice: string;
  invoice_creation_time: string;
  production: string;
  date: string;
  time: string;
}

const unwrap = <T>(payload: unknown): T => {
  const message = (payload as any)?.message ?? payload;
  return message as T;
};

export const kotErrorLogService = {
  async getKotErrors(posProfile: string): Promise<KotErrorLogRow[]> {
    const res = await call<any>("ury.ury.api.ury_kot_validation.get_kot_errors", {
      pos_profile: posProfile,
    });
    return unwrap<KotErrorLogRow[]>(res);
  },
};
