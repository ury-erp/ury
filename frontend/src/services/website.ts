import { call } from '@ury/core';

export interface GalleryRow {
  image: string;
  caption: string;
}

export interface HoursRow {
  day: string;
  opens: string;
  closes: string;
}

export interface ReadinessItem {
  key: string;
  blocking: boolean;
}

export interface WebsiteForm {
  slug: string;
  restaurant: string;
  restaurant_name: string;
  language: string;
  theme: string;
  layout: string;
  logo: string | null;
  hero_image: string | null;
  eyebrow: string;
  hero_title: string;
  hero_description: string;
  show_story: number;
  story_title: string;
  story: string;
  story_image: string | null;
  show_menu: number;
  menu: string | null;
  menu_note: string;
  address: string;
  phone: string;
  map_url: string;
  instagram_url: string;
  enable_reservations: number;
  duration_minutes: number;
  lead_minutes: number;
  advance_days: number;
  max_guests: number;
  booking_note: string;
  privacy_note: string;
  seo_title: string;
  seo_description: string;
  gallery: GalleryRow[];
  hours: HoursRow[];
}

export interface WebsiteState extends WebsiteForm {
  name: string;
  published: number;
  readiness: ReadinessItem[];
}

export interface EditorState {
  website: WebsiteState | null;
  restaurants: { name: string; branch: string; active_menu: string | null }[];
  restaurant: string | null;
  menus: string[];
  themes: string[];
  layouts: string[];
  days: string[];
  defaults: Partial<WebsiteForm>;
  can_write: boolean;
  can_create: boolean;
  max_gallery_rows: number;
}

/** The preview URL for a page, with the editor's unsaved draft applied. */
export function previewUrl(slug: string, nonce: number): string {
  const base = import.meta.env?.VITE_FRAPPE_BASE_URL || '';
  return `${base}/restaurant?slug=${encodeURIComponent(slug)}&preview=1&draft=1&v=${nonce}`;
}

export function publicUrl(slug: string): string {
  const base = import.meta.env?.VITE_FRAPPE_BASE_URL || '';
  return `${base}/restaurant?slug=${encodeURIComponent(slug)}`;
}

export const websiteService = {
  async getState(restaurant?: string): Promise<EditorState> {
    const res = await call<{ message: EditorState }>(
      'ury.ury.api.website_editor.get_editor_state',
      restaurant ? { restaurant } : {},
    );
    return res.message ?? (res as unknown as EditorState);
  },

  async save(payload: WebsiteForm): Promise<WebsiteState> {
    const res = await call<{ message: WebsiteState }>('ury.ury.api.website_editor.save_website', {
      payload: JSON.stringify(payload),
    });
    return res.message ?? (res as unknown as WebsiteState);
  },

  /**
   * Park unsaved edits so the preview can render them.
   *
   * Nothing reaches the database here, which is what makes previewing a
   * published page safe: guests keep seeing the published version until the
   * manager saves.
   */
  async saveDraft(slug: string, payload: WebsiteForm): Promise<void> {
    await call('ury.ury.api.website_editor.save_preview_draft', {
      slug,
      payload: JSON.stringify(payload),
    });
  },

  async discardDraft(slug: string): Promise<void> {
    await call('ury.ury.api.website_editor.discard_preview_draft', { slug });
  },

  async setPublished(slug: string, published: boolean): Promise<WebsiteState> {
    const res = await call<{ message: WebsiteState }>('ury.ury.api.website_editor.set_published', {
      slug,
      published: published ? 1 : 0,
    });
    return res.message ?? (res as unknown as WebsiteState);
  },
};
