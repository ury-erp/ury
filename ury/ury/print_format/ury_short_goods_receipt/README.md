# URY Short Goods Receipt

This POS Invoice Print Format recreates the layout of `Укороченный товарный чек. Фронт.mrt` as Frappe Jinja HTML. It uses the source's A4 landscape page, seller/purchaser blocks, six-column item table, totals, and signature lines.

The editable source is `ury_short_goods_receipt.html`. Run `node build.mjs` after editing it to regenerate the standard Frappe `ury_short_goods_receipt.json` record. Then run `bench --site <site> migrate` on the URY site and set the POS Profile's **Default Print Format** to **URY Short Goods Receipt**.

The POS Invoice supplies the invoice number, date, company, customer, line items, totals, tax rows, and optional addresses and amount in words. The original `.mrt` also expects fiscal register/cheque numbers and item-level VAT allocations. URY does not currently provide a verified mapping for those values; the format omits missing fiscal numbers and leaves item-level tax cells blank. The invoice-level tax and grand total remain populated from ERPNext. This is a commercial receipt layout, not a fiscal receipt integration.

The format is intended for A4 landscape paper. An 80 mm thermal printer requires a separate layout. Merged bills still use `Merged POS Invoice Format` because the POS selects that format explicitly.
