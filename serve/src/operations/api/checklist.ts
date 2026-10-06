import { call } from '@ury/core'

export interface ChecklistItem {
  item_label: string
  is_mandatory: boolean | number
  applies_to?: string
  /** Previously saved result; null/undefined when not answered yet. */
  status?: 'Passed' | 'Failed' | null
  remarks?: string
  /** Quality Goal this item belongs to (Dependent Checklist items only). */
  goal?: string | null
}

export interface ChecklistBlocker {
  role: string
  role_label: string
  goals: string[]
}

export interface ChecklistFetchResult {
  items: ChecklistItem[]
  logName: string | null
  logStatus: string | null
  blockedBy: ChecklistBlocker | null
}

export interface SubmitChecklistItem {
  item_label: string
  /** Explicit result; is_checked (True -> Passed, False -> Open) is still
   * accepted from older clients. */
  status?: 'Passed' | 'Failed'
  is_checked?: boolean
  remarks: string
  goal?: string | null
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
    blocked_by?: ChecklistBlocker | null
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
    blockedBy: message.blocked_by ?? null,
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
