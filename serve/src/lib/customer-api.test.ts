import { beforeEach, describe, expect, it, vi } from 'vitest'

const callPost = vi.fn()

vi.mock('@ury/core', () => ({
  call: {
    post: (...args: unknown[]) => callPost(...args),
  },
  db: {},
}))

import { addCustomer } from './customer-api'

describe('addCustomer link id', () => {
  beforeEach(() => {
    callPost.mockReset()
  })

  it('maps backend name (Customer docname) into data.name', async () => {
    callPost.mockResolvedValue({
      message: {
        status: 'success',
        message: 'Customer created successfully',
        name: 'CUST-00042',
        customer_name: 'Ada Lovelace',
        mobile_number: '999',
        customer_group: 'Individual',
        territory: 'India',
      },
    })
    const result = await addCustomer({ customer_name: 'Ada Lovelace', mobile_number: '999' })
    expect(result.data.name).toBe('CUST-00042')
    expect(result.data.name).not.toBe(result.data.customer_name)
  })
})
