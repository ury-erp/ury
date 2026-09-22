import { call } from '@ury/core';

export interface CreditAccountSummary {
  name: string;
  party_type: string;
  party: string;
  credit_limit: number;
  outstanding: number;
}

export interface CreditBalance {
  credit_account: string;
  outstanding: number;
  credit_limit: number;
  /** Null when the account has no limit. */
  headroom: number | null;
}

export async function searchCreditAccounts(
  posProfile: string,
  search?: string,
  limit = 20
): Promise<CreditAccountSummary[]> {
  const res = await call.get('ury.ury.api.ury_credit.search_credit_accounts', {
    pos_profile: posProfile,
    search: search || undefined,
    limit,
  });
  return (res.message ?? []) as CreditAccountSummary[];
}

export async function getCreditBalance(
  creditAccount: string,
  posProfile: string
): Promise<CreditBalance> {
  const res = await call.get('ury.ury.api.ury_credit.get_credit_balance', {
    credit_account: creditAccount,
    pos_profile: posProfile,
  });
  return res.message as CreditBalance;
}

export async function repayCredit(
  creditAccount: string,
  amount: number,
  modeOfPayment: string,
  posProfile: string
): Promise<{ payment_entry: string; outstanding: number }> {
  const res = await call.post('ury.ury.api.ury_credit.repay_credit', {
    credit_account: creditAccount,
    amount,
    mode_of_payment: modeOfPayment,
    pos_profile: posProfile,
  });
  return res.message as { payment_entry: string; outstanding: number };
}
