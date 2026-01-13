#!/bin/bash

# Script to find hardcoded strings in React components that need translation
# Usage: ./find-untranslated.sh

echo "Searching for hardcoded strings in components..."
echo "================================================"
echo ""

# Find JSX text content (text between > and <)
echo "1. JSX Text Content:"
echo "-------------------"
grep -rn --include="*.tsx" --include="*.ts" ">[A-Z][a-zA-Z ]*<" src/components/ src/pages/ | grep -v "className" | grep -v "import" | head -20

echo ""
echo "2. Hardcoded Placeholders:"
echo "-------------------------"
grep -rn --include="*.tsx" --include="*.ts" 'placeholder="[^{]' src/components/ src/pages/ | head -20

echo ""
echo "3. Hardcoded Button Text:"
echo "------------------------"
grep -rn --include="*.tsx" --include="*.ts" "<button[^>]*>[A-Z]" src/components/ src/pages/ | head -10

echo ""
echo "4. Hardcoded Strings in Quotes:"
echo "-------------------------------"
grep -rn --include="*.tsx" --include="*.ts" "\"[A-Z][a-zA-Z ]{3,}\"" src/components/ src/pages/ | grep -v "className" | grep -v "import" | grep -v "from" | head -20

echo ""
echo "================================================"
echo "Review the above results and add translations for any user-facing text."
echo "Files to check: src/i18n/locales/en.json and src/i18n/locales/ar.json"
