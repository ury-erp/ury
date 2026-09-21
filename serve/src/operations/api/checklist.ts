import { call } from '@ury/core'

export interface ChecklistItem {
  item_label: string
  is_mandatory: boolean | number
  applies_to?: string
}

export interface ChecklistFetchResult {
  items: ChecklistItem[]
  logName: string | null
  logStatus: string | null
}

export interface SubmitChecklistItem {
  item_label: string
  is_checked: boolean
  remarks: string
}

export interface SubmitChecklistResult {
  status: string
  name: string | null
}

type ChecklistApiResponse = {
  message?: {
    items?: ChecklistItem[]
    log_name?: string | null
    log_status?: string | null
    status?: string
    name?: string | null
  }
}

/**
 * URY opening/closing checklist (not Grillax Quality Goal).
 * Methods: ury.ury_pos.api.get_checklist / submit_checklist
 */
export async function fetchOpeningChecklist(
  posProfile: string
): Promise<ChecklistFetchResult> {
  const response = await call.get<ChecklistApiResponse>('ury.ury_pos.api.get_checklist', {
    pos_profile: posProfile,
    checklist_type: 'Opening',
  })
  const message = response?.message ?? {}
  return {
    items: Array.isArray(message.items) ? message.items : [],
    logName: message.log_name ?? null,
    logStatus: message.log_status ?? null,
  }
}

export async function submitOpeningChecklist(
  posProfile: string,
  items: SubmitChecklistItem[],
  posOpeningEntry?: string
): Promise<SubmitChecklistResult> {
  const payload: Record<string, unknown> = {
    pos_profile: posProfile,
    checklist_type: 'Opening',
    items: JSON.stringify(items),
  }
  if (posOpeningEntry) {
    payload.pos_opening_entry = posOpeningEntry
  }

  const response = await call.post<ChecklistApiResponse>(
    'ury.ury_pos.api.submit_checklist',
    payload
  )
  const message = response?.message ?? {}
  return {
    status: message.status ?? 'In Progress',
    name: message.name ?? null,
  }
}

export function isMandatory(item: { is_mandatory?: boolean | number }): boolean {
  return Boolean(Number(item.is_mandatory))
}
