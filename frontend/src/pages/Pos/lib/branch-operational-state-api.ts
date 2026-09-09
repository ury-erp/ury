import { call } from '@ury/core';

export type BranchOperationalHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'BLOCKING' | string;

export interface BranchOperationalBlocker {
  code?: string;
  severity?: string;
  count?: number;
  action?: string;
  message?: string;
}

export interface BranchOperationalAction {
  label?: string;
  action?: string;
  href?: string;
  route?: string;
}

export interface BranchOperationalState {
  branch: string;
  service_date: string;
  inside_business_hours: boolean;
  primary_phase: string;
  phase?: string;
  state?: string;
  health: BranchOperationalHealth;
  is_open?: boolean;
  summary?: string;
  active_services?: string[];
  progress?: Record<string, string>;
  blockers?: BranchOperationalBlocker[];
  next_actions?: BranchOperationalAction[];
  reason?: string | null;
}

const unwrap = <T,>(res: unknown): T => ((res as any)?.message ?? res) as T;

export async function getBranchOperationalState(branch: string): Promise<BranchOperationalState> {
  const res = await call.get<BranchOperationalState>('ury.ury.api.ury_branch_operational_state.get_branch_operational_state', {
    branch,
  });
  return unwrap<BranchOperationalState>(res);
}
