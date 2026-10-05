import { call } from '@ury/core';

export interface ChecklistItem {
  item_label: string;
  is_mandatory: boolean;
  /** Previously saved result; null/undefined when not answered yet. */
  status?: 'Passed' | 'Failed' | null;
  remarks?: string;
  /** Quality Goal this item belongs to (Dependent Checklist items only). */
  goal?: string | null;
}

export interface ChecklistBlocker {
  role: string;
  role_label: string;
  goals: string[];
}

export interface ChecklistResponse {
  message: {
    items: ChecklistItem[];
    log_name: string | null;
    log_status: string | null;
    blocked_by?: ChecklistBlocker | null;
  };
}

export interface SubmitChecklistItem {
  item_label: string;
  /** Explicit result; is_checked (True -> Passed, False -> Open) is still
   * accepted from older clients. */
  status?: 'Passed' | 'Failed';
  is_checked?: boolean;
  remarks: string;
  goal?: string | null;
}

export interface SubmitChecklistResponse {
  message: {
    status: string;
    name: string;
  };
}

export const getChecklist = async (
  posProfile: string,
  checklistType: 'Opening' | 'Closing'
): Promise<{
  items: ChecklistItem[];
  logName: string | null;
  logStatus: string | null;
  blockedBy: ChecklistBlocker | null;
}> => {
  try {
    const response = await call.get<ChecklistResponse>(
      'ury.ury_pos.api.get_checklist',
      {
        pos_profile: posProfile,
        checklist_type: checklistType,
      }
    );

    // Map backend's snake_case keys to camelCase for consumer compatibility
    return {
      items: response.message.items,
      logName: response.message.log_name,
      logStatus: response.message.log_status,
      blockedBy: response.message.blocked_by ?? null,
    };
  } catch (error) {
    console.error('Error fetching checklist:', error);
    throw error;
  }
};

export const submitChecklist = async (
  posProfile: string,
  checklistType: 'Opening' | 'Closing',
  items: SubmitChecklistItem[],
  posOpeningEntry?: string
): Promise<{
  status: string;
  name: string;
}> => {
  try {
    const payload: Record<string, any> = {
      pos_profile: posProfile,
      checklist_type: checklistType,
      items: JSON.stringify(items),
    };

    if (posOpeningEntry) {
      payload.pos_opening_entry = posOpeningEntry;
    }

    const response = await call.post<SubmitChecklistResponse>(
      'ury.ury_pos.api.submit_checklist',
      payload
    );

    return response.message;
  } catch (error) {
    console.error('Error submitting checklist:', error);
    throw error;
  }
};
