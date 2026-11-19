export interface Brand {
  name: string;
  logo?: string;
  favicon?: string;
}

/** Only explicit Website Settings branding may override an app's URY defaults. */
export function resolveBrand<T extends Brand>(defaults: T): T {
  const brand = typeof window === 'undefined' ? null : (
    window as Window & { frappe?: { boot?: { ury_brand?: Partial<Brand> | null } } }
  ).frappe?.boot?.ury_brand;

  return {
    ...defaults,
    name: brand?.name || defaults.name,
    logo: brand?.logo || defaults.logo,
    favicon: brand?.favicon || defaults.favicon,
  };
}
