import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bootstrapDeviceMock = vi.fn()

vi.mock('../lib/api', () => ({
  bootstrapDevice: (...args: Parameters<typeof import('../lib/api').bootstrapDevice>) => bootstrapDeviceMock(...args),
}))

import { useDeviceBootstrap } from './useDeviceBootstrap'
import type { OrderingContext } from '../lib/api'

const DEVICE_ID_KEY = 'ury_device_id'
const DEVICE_CREDENTIAL_KEY = 'ury_device_credential'

const buildContext = (overrides: Partial<OrderingContext> = {}): OrderingContext => ({
  session: 'SESSION-1',
  source: 'device',
  restaurant: 'Kozhikode',
  company: 'URY',
  table: 'T1',
  layout: 'Tablet',
  capabilities: {
    product_detail_enabled: true,
    show_item_images: true,
    show_item_descriptions: true,
    item_notes_enabled: true,
    request_bill_enabled: true,
    customer_payment_enabled: true,
    payment_link_enabled: true,
    pay_at_counter_enabled: true,
    add_to_running_table_enabled: true,
  },
  session_idle_timeout_minutes: 30,
  ...overrides,
})

describe('useDeviceBootstrap', () => {
  beforeEach(() => {
    localStorage.clear()
    bootstrapDeviceMock.mockReset()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('does not treat the browser as a provisioned device when no credentials are stored', async () => {
    const { result } = renderHook(() => useDeviceBootstrap())

    await waitFor(() => expect(result.current.deviceLoading).toBe(false))

    expect(result.current.isDevice).toBe(false)
    expect(result.current.deviceContext).toBeNull()
    expect(result.current.deviceError).toBeNull()
    expect(bootstrapDeviceMock).not.toHaveBeenCalled()
  })

  it('does not bootstrap when only one of the two credential keys is present', async () => {
    localStorage.setItem(DEVICE_ID_KEY, 'device-1')
    // no credential stored

    const { result } = renderHook(() => useDeviceBootstrap())

    await waitFor(() => expect(result.current.deviceLoading).toBe(false))

    expect(result.current.isDevice).toBe(false)
    expect(bootstrapDeviceMock).not.toHaveBeenCalled()
  })

  it('bootstraps via the device-credential path when both keys are stored', async () => {
    localStorage.setItem(DEVICE_ID_KEY, 'device-1')
    localStorage.setItem(DEVICE_CREDENTIAL_KEY, 'cred-1')
    const context = buildContext()
    bootstrapDeviceMock.mockResolvedValue(context)

    const { result } = renderHook(() => useDeviceBootstrap())

    expect(result.current.isDevice).toBe(true)

    await waitFor(() => expect(result.current.deviceLoading).toBe(false))

    expect(bootstrapDeviceMock).toHaveBeenCalledWith('device-1', 'cred-1')
    expect(result.current.deviceContext).toEqual(context)
    expect(result.current.deviceError).toBeNull()
  })

  it('surfaces a friendly error message when bootstrapDevice rejects with an Error', async () => {
    localStorage.setItem(DEVICE_ID_KEY, 'device-1')
    localStorage.setItem(DEVICE_CREDENTIAL_KEY, 'cred-1')
    bootstrapDeviceMock.mockRejectedValue(new Error('device credential revoked'))

    const { result } = renderHook(() => useDeviceBootstrap())

    await waitFor(() => expect(result.current.deviceLoading).toBe(false))

    expect(result.current.isDevice).toBe(true)
    expect(result.current.deviceContext).toBeNull()
    expect(result.current.deviceError).toBe('device credential revoked')
  })

  it('falls back to a generic error message when bootstrapDevice rejects with a non-Error value', async () => {
    localStorage.setItem(DEVICE_ID_KEY, 'device-1')
    localStorage.setItem(DEVICE_CREDENTIAL_KEY, 'cred-1')
    bootstrapDeviceMock.mockRejectedValue('network down')

    const { result } = renderHook(() => useDeviceBootstrap())

    await waitFor(() => expect(result.current.deviceLoading).toBe(false))

    expect(result.current.deviceError).toBe('Unable to bootstrap this device.')
  })
})
