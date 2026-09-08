import { describe, expect, it } from 'vitest'
import { apiErrorMessage } from './api-error'

describe('API validation messages', () => {
  it('exposes Frappe validation text without HTML', () => {
    const _server_messages = JSON.stringify([JSON.stringify({ message: 'Missing price for <b>Biriyani</b>' })])
    expect(apiErrorMessage({ _server_messages, message: 'Request failed' }, 'Fallback')).toBe('Missing price for Biriyani')
  })

  it('keeps the original error when server messages are malformed', () => {
    expect(apiErrorMessage({ _server_messages: 'invalid', message: 'Connection failed' }, 'Fallback')).toBe('Connection failed')
    expect(apiErrorMessage(null, 'Fallback')).toBe('Fallback')
  })
})
