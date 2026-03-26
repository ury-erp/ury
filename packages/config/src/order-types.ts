/**
 * URY Order Types and Status Constants
 * 
 * Defines all order types, fulfillment statuses, and order sources
 * used across URY applications.
 */

// ============================================================================
// Order Types
// ============================================================================

export type OrderType = "Dine In" | "Take Away" | "Delivery" | "Phone In" | "Aggregators" | "Curbside";

export interface OrderTypeConfig {
    label: string;
    value: OrderType;
    description?: string;
    requiresTable?: boolean;
    requiresAddress?: boolean;
    allowScheduled?: boolean;
}

export const ORDER_TYPES: OrderTypeConfig[] = [
    {
        label: "Dine In",
        value: "Dine In",
        description: "Customer dining at the restaurant",
        requiresTable: true,
        allowScheduled: false,
    },
    {
        label: "Take Away",
        value: "Take Away",
        description: "Customer picks up the order",
        requiresTable: false,
        allowScheduled: true,
    },
    {
        label: "Delivery",
        value: "Delivery",
        description: "Order delivered to customer address",
        requiresTable: false,
        requiresAddress: true,
        allowScheduled: true,
    },
    {
        label: "Phone In",
        value: "Phone In",
        description: "Order placed via phone call",
        requiresTable: false,
        allowScheduled: true,
    },
    {
        label: "Aggregators",
        value: "Aggregators",
        description: "Order from Swiggy, Zomato, etc.",
        requiresTable: false,
        allowScheduled: false,
    },
    {
        label: "Curbside",
        value: "Curbside",
        description: "Customer picks up from car",
        requiresTable: false,
        allowScheduled: true,
    },
];

export const DEFAULT_ORDER_TYPE: OrderType = "Take Away";
export const DINE_IN: OrderType = "Dine In";

// ============================================================================
// Order Sources (for tracking where orders originate)
// ============================================================================

export type OrderSource = "POS" | "QR" | "Online" | "Kiosk" | "WhatsApp";

export interface OrderSourceConfig {
    label: string;
    value: OrderSource;
    description: string;
}

export const ORDER_SOURCES: OrderSourceConfig[] = [
    { label: "POS", value: "POS", description: "Staff POS application" },
    { label: "QR", value: "QR", description: "QR table self-order" },
    { label: "Online", value: "Online", description: "Online ordering website" },
    { label: "Kiosk", value: "Kiosk", description: "Self-service kiosk" },
    { label: "WhatsApp", value: "WhatsApp", description: "WhatsApp ordering" },
];

// ============================================================================
// Fulfillment Status (for customer order tracking)
// ============================================================================

export type FulfillmentStatus = 
    | "Placed" 
    | "Confirmed" 
    | "Preparing" 
    | "Ready" 
    | "Served" 
    | "Picked Up" 
    | "Out for Delivery" 
    | "Delivered" 
    | "Cancelled";

export interface FulfillmentStatusConfig {
    label: string;
    value: FulfillmentStatus;
    description: string;
    color: string;
    isTerminal: boolean;
}

export const FULFILLMENT_STATUSES: FulfillmentStatusConfig[] = [
    { label: "Placed", value: "Placed", description: "Order received", color: "gray", isTerminal: false },
    { label: "Confirmed", value: "Confirmed", description: "Order confirmed by restaurant", color: "blue", isTerminal: false },
    { label: "Preparing", value: "Preparing", description: "Being prepared in kitchen", color: "orange", isTerminal: false },
    { label: "Ready", value: "Ready", description: "Ready for pickup/delivery", color: "green", isTerminal: false },
    { label: "Served", value: "Served", description: "Served to customer (dine-in)", color: "green", isTerminal: true },
    { label: "Picked Up", value: "Picked Up", description: "Customer picked up order", color: "green", isTerminal: true },
    { label: "Out for Delivery", value: "Out for Delivery", description: "On the way to customer", color: "blue", isTerminal: false },
    { label: "Delivered", value: "Delivered", description: "Delivered to customer", color: "green", isTerminal: true },
    { label: "Cancelled", value: "Cancelled", description: "Order cancelled", color: "red", isTerminal: true },
];

// Initial status when order is created
export const INITIAL_FULFILLMENT_STATUS: FulfillmentStatus = "Placed";

// ============================================================================
// POS Invoice Status (existing ERPNext statuses)
// ============================================================================

export type InvoiceStatus = "Draft" | "Unbilled" | "Recently Paid" | "Paid" | "Consolidated" | "Return";

export const BASE_ORDER_STATUS_TYPES = [
    { label: "Draft", value: "Draft" },
    { label: "Unbilled", value: "Unbilled" },
];

export const RECENTLY_PAID_STATUS_TYPE = [
    { label: "Recently Paid", value: "Recently Paid" },
];

export const EXTENDED_ORDER_STATUS_TYPES = [
    { label: "Paid", value: "Paid" },
    { label: "Consolidated", value: "Consolidated" },
    { label: "Return", value: "Return" },
];

export const getOrderStatusTypes = (viewAllStatus?: number, paidLimit?: number) => {
    let statusTypes = [...BASE_ORDER_STATUS_TYPES];
    
    if (paidLimit && paidLimit > 0) {
        statusTypes.push(...RECENTLY_PAID_STATUS_TYPE);
    }
    
    if (viewAllStatus === 1) {
        statusTypes.push(...EXTENDED_ORDER_STATUS_TYPES);
    }
    
    return statusTypes;
};

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_PAYMENT_MODE = "Cash";
