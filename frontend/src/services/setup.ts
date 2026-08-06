import { call } from '@ury/core';

export interface SetupDefaults {
  languages: { value: string; label: string }[];
  detected_country: string;
  countries: string[];
  currencies: { value: string; label: string; symbol: string }[];
  timezones: string[];
}

export interface CountryDefaults {
  currency: string;
  timezone: string;
  charts_of_accounts: { value: string; label: string }[];
}

export interface SetupPayload {
  language: string;
  country: string;
  timezone: string;
  currency: string;
  company_name: string;
  company_abbr: string;
  chart_of_accounts?: string;
  fy_start_date: string;
  installation_type: 'minimal' | 'advanced';
}

export const setupService = {
  async getDefaults(): Promise<SetupDefaults> {
    const res = await call<any>('ury.ury.api.minimal.setup_organization.get_setup_defaults');
    return res?.message ?? res;
  },
  async getCountryDefaults(country: string): Promise<CountryDefaults> {
    const res = await call<any>('ury.ury.api.minimal.setup_organization.get_country_defaults', { country });
    return res?.message ?? res;
  },
  async submitSetup(payload: SetupPayload): Promise<void> {
    const res = await call<any>('ury.ury.api.minimal.setup_organization.complete_wizard_setup', payload);
    return res?.message ?? res;
  },
  async submitConfigureData(data: any): Promise<any> {
    const res = await call<any>('ury.ury.api.minimal.business_setup.submit_configure_data', { data });
    return res?.message ?? res;
  }
};
