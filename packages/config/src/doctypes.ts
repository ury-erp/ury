/**
 * URY DocType Constants
 * 
 * Centralized registry of all DocType names used across URY applications.
 * This ensures consistency and prevents typos when referencing DocTypes.
 */

export const DOCTYPES = {
    // Core ERPNext DocTypes
    POS_PROFILE: "POS Profile",
    POS_INVOICE: "POS Invoice",
    POS_OPENING_ENTRY: "POS Opening Entry",
    CUSTOMER: "Customer",
    CUSTOMER_GROUP: "Customer Group",
    TERRITORY: "Territory",
    CURRENCY: "Currency",
    ITEM: "Item",
    ITEM_GROUP: "Item Group",
    PRICE_LIST: "Price List",
    MODE_OF_PAYMENT: "Mode of Payment",
    
    // URY Core DocTypes
    URY_RESTAURANT: "URY Restaurant",
    URY_MENU: "URY Menu",
    URY_MENU_ITEM: "URY Menu Item",
    URY_MENU_COURSE: "URY Menu Course",
    URY_ROOM: "URY Room",
    URY_TABLE: "URY Table",
    URY_KOT: "URY KOT",
    URY_KOT_ITEMS: "URY KOT Items",
    URY_ORDER: "URY Order",
    URY_PRINTER_SETTINGS: "URY Printer Settings",
    URY_PRODUCTION_UNIT: "URY Production Unit",
    
    // URY Customer Module DocTypes (New)
    URY_CUSTOMER_SESSION: "URY Customer Session",
    URY_PAYMENT_GATEWAY: "URY Payment Gateway",
    URY_KIOSK_DEVICE: "URY Kiosk Device",
    URY_FULFILLMENT_LOG: "URY Fulfillment Log",
} as const;

/**
 * Type for DocType names - enables autocomplete and type checking
 */
export type DocTypeName = typeof DOCTYPES[keyof typeof DOCTYPES];
