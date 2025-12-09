#!/bin/bash

echo "=== Finding Complete Print Flow ==="
echo ""

echo "1. Print function usage:"
grep -r "print(" . --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v "console.log\|print:" | head -10

echo ""
echo "2. Invoice/Payment completion:"
grep -r "complete.*payment\|submit.*invoice\|process.*payment" . --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | head -10

echo ""
echo "3. Files that import print functions:"
grep -r "from.*print" . --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules

echo ""
echo "4. Checking PaymentDialog.tsx for print calls:"
grep -n "print\|complete\|submit" components/PaymentDialog.tsx 2>/dev/null | head -15

echo ""
echo "5. Checking pos-store.ts for relevant functions:"
grep -n "const.*=.*(" store/pos-store.ts 2>/dev/null | grep -i "pay\|invoice\|order\|complete" | head -10

echo ""
echo "=== Flow search complete ==="
