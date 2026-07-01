export const storage = {
  savePosProfileFull: (profile: unknown) => {
    localStorage.setItem('pos_profile', JSON.stringify(profile));
  },

  getPosProfileFull: () => {
    const profile = localStorage.getItem('pos_profile');
    if (!profile) return null;
    try {
      return JSON.parse(profile);
    } catch {
      localStorage.removeItem('pos_profile');
      return null;
    }
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