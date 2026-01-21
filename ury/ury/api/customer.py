import frappe
from frappe import _
import re


def validate_search_input(search_term):
    """Validate and sanitize search input to prevent SQL injection"""
    if not search_term:
        return ""
    if len(search_term) > 100:
        frappe.throw(_("Search term too long (max 100 characters)"))
    search_term = search_term.strip()
    
    return search_term


@frappe.whitelist()
def get(search, limit=20):
    """    
    Searches across multiple customer fields using LIKE pattern matching.
    Respects user permissions automatically via frappe.db.get_all.
    
    Args:
        search (str): Search term to match against customer fields
        limit (int): Maximum number of results to return (default: 20)
    
    Returns:
        list: List of customer records with name, customer_name, mobile_number, email_id
    """
   
    search = validate_search_input(search)
    
    if not search:
        return []
    
    try:
        limit = int(limit)
        if limit <= 0:
            limit = 20
        if limit > 100:
            limit = 100
    except (ValueError, TypeError):
        limit = 20
    
    
    consecutive_pattern = f"%{search}%"
    
    flexible_pattern = '%' + '%'.join(list(search)) + '%'
    
    try:
        customers = frappe.db.get_all(
            "Customer",
            fields=["name", "customer_name", "mobile_number", "email_id"],
            or_filters=[
                # Consecutive pattern matching
                ["name", "like", consecutive_pattern],
                ["customer_name", "like", consecutive_pattern],
                ["mobile_number", "like", consecutive_pattern],
                ["email_id", "like", consecutive_pattern],
                ["customer_name", "like", flexible_pattern],
                ["name", "like", flexible_pattern],
            ],
            order_by="modified desc",
            limit=limit
        )
        
        return customers
    
    except Exception as e:
        frappe.log_error(
            message=frappe.get_traceback(),
            title=f"Customer Search Error: {str(e)}"
        )
        # Return empty list instead of throwing error to prevent breaking UI
        return []
