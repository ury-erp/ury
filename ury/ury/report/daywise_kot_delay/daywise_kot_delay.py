# Copyright (c) 2024, Tridz and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import get_datetime,today

def execute(filters=None):
  branch = filters.get("branch")
  columns, data = [], []
  now = get_datetime() 
  start_date = filters.get("from_date")
  end_date = filters.get("to_date")
  alert_time = frappe.db.get_value("POS Profile",{"branch":branch},"custom_kot_warning_time")
  # alert_time = frappe.get_single('Alert Settings').kot_delay_time
  kot_list = frappe.db.sql('''
    SELECT
      kot.name AS name,
      kot.restaurant_table AS restaurant_table,
      ROUND(kot.production_time,3) AS minutes,
      kot.invoice AS invoice,
      kot.date AS date,
      kot.name AS name
    FROM
      (
        SELECT %(start_date)s AS `date`
        UNION
        SELECT DATE_ADD(%(start_date)s, INTERVAL n DAY) AS `date`
        FROM (
            SELECT a.N + b.N * 10 + c.N * 100 + 1 AS n
            FROM (
                SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            ) AS a
            CROSS JOIN (
                SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            ) AS b
            CROSS JOIN (
                SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            ) AS c
            ORDER BY n
        ) AS nums
        WHERE DATE_ADD(%(start_date)s, INTERVAL n DAY) < %(end_date)s
        UNION
        SELECT %(end_date)s AS `date`
       
      ) AS date_list
    LEFT JOIN `tabURY KOT` AS kot ON(
        kot.production_time >  %(alert_time)s
        AND kot.order_status = 'Served'
        AND kot.branch = %(branch)s
    )
    LEFT JOIN `tabURY Report Settings` rs ON (
        rs.`branch` = %(branch)s
    )
    WHERE
    (
      ((rs.`hours` IS NULL OR rs.`hours` = 0) AND kot.`date` = date_list.`date`)
      OR (rs.`hours` > 0 AND TIMESTAMP(kot.`date`, kot.`time`) <= TIMESTAMP(DATE_ADD(date_list.`date`, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(kot.`date`, kot.`time`) >= TIMESTAMP(date_list.`date`, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
      OR (rs.`branch` IS NULL AND kot.`date` = date_list.`date`)
    )
    ORDER BY
      minutes DESC;
  ''',{"now": now,"alert_time":alert_time,"branch":branch,"today":today(),"start_date":start_date,"end_date":end_date}, as_dict=True)
  for kot in kot_list:
    tableOrTakeaway = kot['restaurant_table'] if kot['restaurant_table'] else frappe.db.get_value("POS Invoice", kot['invoice'], "order_type")
    row =[
        kot['date'],
        kot['name'],
        kot['invoice'],
        kot['invoice'].split('-')[-1],
        tableOrTakeaway,
        f"{kot['minutes']} Mins"
      ]
    data.append(row)
  columns = [
        {"label": "Date", "fieldname": "date", "fieldtype": "Date"},
        {"label": "KOT", "fieldname": "name", "fieldtype": "Link", "options": "URY KOT"},
        {"label": "Invoice", "fieldname": "invoice", "fieldtype": "Link", "options": "POS Invoice"},
        {"label": "Order", "fieldname": "order", "fieldtype": "Data"},
        {"label": "Table Name", "fieldname": "table_name", "fieldtype": "Data"},
        {"label": "Time", "fieldname": "time", "fieldtype": "Data"}
    ]
  return columns, data