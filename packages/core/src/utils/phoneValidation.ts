import { getCountryCallingCode, COUNTRY_CALLING_CODES } from './countryCallingCodes';

export { getCountryCallingCode, COUNTRY_CALLING_CODES };

export interface PhoneValidationResult {
  isValid: boolean;
  message: string;
  sanitized: string;
}

/**
 * Strips formatting characters (spaces, dashes, parens, dots)
 * keeping digits and leading '+' if present.
 */
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
    // 10 digits starting with 6-9, optionally prefixed by +91, 91, or 0
    pattern: /^(?:(?:\+91|91|0))?[6-9]\d{9}$/,
    hint: 'Expected 10 digits starting with 6, 7, 8, or 9',
  },
  'united arab emirates': {
    name: 'United Arab Emirates',
    isd: '+971',
    // 9 digits starting with 5, optionally prefixed by +971, 971, or 0
    pattern: /^(?:(?:\+971|971|0))?5\d{8}$/,
    hint: 'Expected 9 digits starting with 5 (e.g. 50XXXXXXX or 050XXXXXXX)',
  },
  'saudi arabia': {
    name: 'Saudi Arabia',
    isd: '+966',
    // 9 digits starting with 5, optionally prefixed by +966, 966, or 0
    pattern: /^(?:(?:\+966|966|0))?5\d{8}$/,
    hint: 'Expected 9 digits starting with 5 (e.g. 5XXXXXXXX or 05XXXXXXXX)',
  },
  oman: {
    name: 'Oman',
    isd: '+968',
    // 8 digits starting with 7 or 9, optionally prefixed by +968 or 968
    pattern: /^(?:(?:\+968|968))?(?:7|9)\d{7}$/,
    hint: 'Expected 8 digits starting with 7 or 9',
  },
  qatar: {
    name: 'Qatar',
    isd: '+974',
    // 8 digits starting with 3, 5, 6, 7, optionally prefixed by +974 or 974
    pattern: /^(?:(?:\+974|974))?[3567]\d{7}$/,
    hint: 'Expected 8 digits starting with 3, 5, 6, or 7',
  },
  kuwait: {
    name: 'Kuwait',
    isd: '+965',
    // 8 digits starting with 4, 5, 6, 9, optionally prefixed by +965 or 965
    pattern: /^(?:(?:\+965|965))?[4569]\d{7}$/,
    hint: 'Expected 8 digits starting with 4, 5, 6, or 9',
  },
  bahrain: {
    name: 'Bahrain',
    isd: '+973',
    // 8 digits starting with 3, 6, 9, optionally prefixed by +973 or 973
    pattern: /^(?:(?:\+973|973))?[369]\d{7}$/,
    hint: 'Expected 8 digits starting with 3, 6, or 9',
  },
  'united states': {
    name: 'United States',
    isd: '+1',
    // 10 digits starting with [2-9]xx[2-9]xxxxxx, optionally prefixed by +1 or 1
    pattern: /^(?:(?:\+?1))?[2-9]\d{2}[2-9]\d{6}$/,
    hint: 'Expected 10 digits (US area code + number)',
  },
  canada: {
    name: 'Canada',
    isd: '+1',
    pattern: /^(?:(?:\+?1))?[2-9]\d{2}[2-9]\d{6}$/,
    hint: 'Expected 10 digits (area code + number)',
  },
  'united kingdom': {
    name: 'United Kingdom',
    isd: '+44',
    // UK mobile starts with 7, 10 digits after leading 0 or +44
    pattern: /^(?:(?:\+44|0))?7\d{9}$/,
    hint: 'Expected 10 digits starting with 7 (e.g. 07XXXXXXXXX)',
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

// General ITU-T E.164 pattern: + followed by 7 to 15 digits
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
// General phone numbers: 7 to 15 digits
const GENERAL_DIGITS_PATTERN = /^\+?[1-9]\d{6,14}$/;

/**
 * Validates a mobile number according to the specified country (from POS Profile).
 * If the number is prefixed with '+', international E.164 format is also accepted.
 */
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

  // Pure digits without prefix
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
    // Check against country-specific rule
    if (rule.pattern.test(sanitized)) {
      return {
        isValid: true,
        message: '',
        sanitized,
      };
    }

    // If customer entered international number starting with '+' from another country
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

  // If a country was specified but we don't have a specific regex for it
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

  // Fallback if no country specified
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
