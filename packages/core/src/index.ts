export { createFrappeClient, call, db, auth } from './frappe/client';
export { getLoggedUser, getUserRoles, logout, login } from './frappe/auth';
export { isUserRestrictedFromTableOrders, canCaptainTransfer, derivePOSCapabilities } from './frappe/roles';
export { parseFrappeError } from './frappe/errors';
export {
  buildDeskUrl,
  withReturnContext,
  getCurrentReturnContext,
  isReturnPathAllowed,
  appLabelForPath,
  DESK_RETURN_PARAM,
  DESK_RETURN_LABEL_PARAM,
  RETURN_TO_ALLOWED_PREFIXES,
} from './frappe/deskLink';
export type { ReturnContext, BuildDeskUrlOptions } from './frappe/deskLink';
export type { POSCapabilities } from './frappe/roles';
export type { User, PosProfileCombined } from './types';
export { storage } from './storage';
export {
  formatCurrency,
  formatCompactCurrency,
  formatInvoiceTime,
  normalizeFrappeTime,
  setActiveCurrency,
  getActiveCurrency,
  currencyFractionDigits,
  MIXED_CURRENCY,
} from './format';
export type { CurrencyInfo } from './format';
export { initPrinting, loadQzPrinter, disconnectQzPrinter, printWithQz } from './print/qz';
export { validateFieldValue } from './utils/validateField';
export type { ValidationMessages } from './utils/validateField';
export { validatePhoneNumber, sanitizePhoneNumber, getCountryCallingCode, COUNTRY_CALLING_CODES } from './utils/phoneValidation';
export type { PhoneValidationResult } from './utils/phoneValidation';

