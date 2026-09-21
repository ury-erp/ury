import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

function createMemoryStorage(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    clear() {
      store = {}
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null
    },
    removeItem(key: string) {
      delete store[key]
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
  }
}

// Node 26 + Vitest 4: localStorage may be missing or unusable without --localstorage-file.
function ensureStorage(name: 'localStorage' | 'sessionStorage') {
  const existing = globalThis[name]
  let usable = false
  if (existing) {
    try {
      existing.setItem('__ury_test__', '1')
      existing.removeItem('__ury_test__')
      usable = true
    } catch {
      usable = false
    }
  }
  if (!usable) {
    Object.defineProperty(globalThis, name, {
      value: createMemoryStorage(),
      writable: true,
      configurable: true,
    })
  }
}

ensureStorage('localStorage')
ensureStorage('sessionStorage')

afterEach(() => {
  cleanup()
})
