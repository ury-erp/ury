import { getCountryCallingCode, COUNTRY_CALLING_CODES } from './country-calling-codes';

export { getCountryCallingCode, COUNTRY_CALLING_CODES };

export interface PhoneValidationResult {
  isValid: boolean;
  message: string;
  sanitized: string;
}

export function sanitizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  const startsWithPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  return startsWithPlus ? `+${digitsOnly}` : digitsOnly;
}

interface CountryRule {
  name: string;
  isd: string;
  pattern: RegExp;
  hint: string;
}

const COUNTRY_RULES: Record<string, CountryRule> = {
  india: {
    name: 'India',
    isd: '+91',
    pattern: /^(?:(?:\+91|91|0))?[6-9]\d{9}$/,
    hint: 'Expected 10 digits starting with 6, 7, 8, or 9',
  },
  'united arab emirates': {
    name: 'United Arab Emirates',
    isd: '+971',
    pattern: /^(?:(?:\+971|971|0))?5\d{8}$/,
    hint: 'Expected 9 digits starting with 5',
  },
  'saudi arabia': {
    name: 'Saudi Arabia',
    isd: '+966',
    pattern: /^(?:(?:\+966|966|0))?5\d{8}$/,
    hint: 'Expected 9 digits starting with 5',
  },
  oman: {
    name: 'Oman',
    isd: '+968',
    pattern: /^(?:(?:\+968|968))?(?:7|9)\d{7}$/,
    hint: 'Expected 8 digits starting with 7 or 9',
  },
  qatar: {
    name: 'Qatar',
    isd: '+974',
    pattern: /^(?:(?:\+974|974))?[3567]\d{7}$/,
    hint: 'Expected 8 digits starting with 3, 5, 6, or 7',
  },
  kuwait: {
    name: 'Kuwait',
    isd: '+965',
    pattern: /^(?:(?:\+965|965))?[4569]\d{7}$/,
    hint: 'Expected 8 digits starting with 4, 5, 6, or 9',
  },
  bahrain: {
    name: 'Bahrain',
    isd: '+973',
    pattern: /^(?:(?:\+973|973))?[369]\d{7}$/,
    hint: 'Expected 8 digits starting with 3, 6, or 9',
  },
  'united states': {
    name: 'United States',
    isd: '+1',
    pattern: /^(?:(?:\+?1))?[2-9]\d{2}[2-9]\d{6}$/,
    hint: 'Expected 10 digits',
  },
  canada: {
    name: 'Canada',
    isd: '+1',
    pattern: /^(?:(?:\+?1))?[2-9]\d{2}[2-9]\d{6}$/,
    hint: 'Expected 10 digits',
  },
  'united kingdom': {
    name: 'United Kingdom',
    isd: '+44',
    pattern: /^(?:(?:\+44|0))?7\d{9}$/,
    hint: 'Expected 10 digits starting with 7',
  },
};

const COUNTRY_ALIASES: Record<string, string> = {
  in: 'india',
  ind: 'india',
  ae: 'united arab emirates',
  uae: 'united arab emirates',
  sa: 'saudi arabia',
  ksa: 'saudi arabia',
  om: 'oman',
  omn: 'oman',
  qa: 'qatar',
  qat: 'qatar',
  kw: 'kuwait',
  kwt: 'kuwait',
  bh: 'bahrain',
  bhr: 'bahrain',
  us: 'united states',
  usa: 'united states',
  ca: 'canada',
  can: 'canada',
  gb: 'united kingdom',
  uk: 'united kingdom',
};

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const GENERAL_DIGITS_PATTERN = /^\+?[1-9]\d{6,14}$/;

export function validatePhoneNumber(
  phone: string,
  country?: string | null
): PhoneValidationResult {
  const sanitized = sanitizePhoneNumber(phone);

  if (!sanitized) {
    return {
      isValid: false,
      message: 'Mobile number is required',
      sanitized: '',
    };
  }

  const digitsOnly = sanitized.replace(/\D/g, '');
  if (!digitsOnly) {
    return {
      isValid: false,
      message: 'Invalid mobile number format',
      sanitized,
    };
  }

  const callingCode = getCountryCallingCode(country);
  const callingCodeDigits = callingCode.replace(/\D/g, '');
  if (
    callingCodeDigits &&
    digitsOnly === callingCodeDigits &&
    (sanitized === callingCode || sanitized === `+${callingCodeDigits}` || sanitized === callingCodeDigits)
  ) {
    return {
      isValid: false,
      message: 'Mobile number is required',
      sanitized: '',
    };
  }

  const normalizedCountryKey = (country || '').trim().toLowerCase();
  const canonicalCountryKey =
    COUNTRY_ALIASES[normalizedCountryKey] || normalizedCountryKey;
  const rule = COUNTRY_RULES[canonicalCountryKey];

  if (rule) {
    if (rule.pattern.test(sanitized)) {
      return {
        isValid: true,
        message: '',
        sanitized,
      };
    }

    if (
      sanitized.startsWith('+') &&
      !sanitized.startsWith(rule.isd) &&
      E164_PATTERN.test(sanitized)
    ) {
      return {
        isValid: true,
        message: '',
        sanitized,
      };
    }

    return {
      isValid: false,
      message: `Invalid mobile number for ${rule.name}`,
      sanitized,
    };
  }

  if (country && country.trim()) {
    if (GENERAL_DIGITS_PATTERN.test(sanitized)) {
      return {
        isValid: true,
        message: '',
        sanitized,
      };
    }
    return {
      isValid: false,
      message: `Invalid mobile number for ${country.trim()}`,
      sanitized,
    };
  }

  if (GENERAL_DIGITS_PATTERN.test(sanitized)) {
    return {
      isValid: true,
      message: '',
      sanitized,
    };
  }

  return {
    isValid: false,
    message: 'Invalid mobile number format',
    sanitized,
  };
}
