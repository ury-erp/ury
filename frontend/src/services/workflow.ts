import { call } from '@ury/core';

export interface WorkflowState {
  state: string;
  doc_status: string;
}

export interface WorkflowAction {
  action: string;
  next_state: string;
}

export interface WorkflowStatus {
  workflow_state_field: string;
  current_state: string;
  states: WorkflowState[];
  actions: WorkflowAction[];
}

export const workflowService = {
  async getStatus(doctype: string, name: string): Promise<WorkflowStatus | null> {
    const res = await call.get<WorkflowStatus | null>(
      'ury.ury.api.ury_workflow.get_workflow_status',
      { doctype, name },
    );
    return ((res as any)?.message ?? res ?? null) as WorkflowStatus | null;
  },

  async applyAction(doctype: string, name: string, action: string): Promise<{ name: string; status: string }> {
    const res = await call.post<{ name: string; status: string }>(
      'ury.ury.api.ury_workflow.apply_workflow_action',
      { doctype, name, action },
    );
    return ((res as any)?.message ?? res) as { name: string; status: string };
  },
};
