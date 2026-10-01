const APP_LOCAL_STORAGE_KEYS = [
  'userAuth', 'selectedRoom', 'posOrderTabsData', 'pos_profile',
  'currency', 'currencySymbol', 'ury_language', 'kot_time',
];
const APP_SESSION_STORAGE_KEYS = [
  'posProfile', 'menuCategories', 'customerGroups', 'territories', 'payment_modes',
];

export function getOrderTabsStorageKey(user: string | undefined): string | null {
  return user && user !== 'Guest' ? `posOrderTabsData:${user}` : null;
}

export function clearAppStorage(): void {
  APP_LOCAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  APP_SESSION_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));
  // Walk backwards because removeItem changes the storage indices.
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key && (key.startsWith('posOrderTabsData:') || /^.+_.+_strike$/.test(key))) {
      localStorage.removeItem(key);
    }
  }
  for (let index = sessionStorage.length - 1; index >= 0; index--) {
    const key = sessionStorage.key(index);
    if (key && (key.startsWith('ury_rooms_') || key.startsWith('ury_room_counts_'))) {
      sessionStorage.removeItem(key);
    }
  }
}

export const storage = {
  savePosProfileFull: (profile: unknown) => {
    localStorage.setItem('pos_profile', JSON.stringify(profile));
  },

  getPosProfileFull: () => {
    const profile = localStorage.getItem('pos_profile');
    return profile ? JSON.parse(profile) : null;
  },

  setItem: (key: string, value: string) => {
    localStorage.setItem(key, value);
  },

  getItem: (key: string): string | null => {
    return localStorage.getItem(key);
  },

  removeItem: (key: string) => {
    localStorage.removeItem(key);
  }
}; 
