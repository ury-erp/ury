import { call } from '@ury/core';

export interface ChecklistItem {
  item_label: string;
  is_mandatory: boolean;
}

export interface ChecklistResponse {
  message: {
    items: ChecklistItem[];
    log_name: string | null;
    log_status: string | null;
  };
}

export interface SubmitChecklistItem {
  item_label: string;
  is_checked: boolean;
  remarks: string;
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
}> => {
  try {
    const response = await call.get<ChecklistResponse>(
      'ury.ury_pos.api.get_checklist',
      {
        pos_profile: posProfile,
        checklist_type: checklistType,
      }
    );

    return {
      items: response.message.items,
      logName: response.message.log_name,
      logStatus: response.message.log_status,
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
