#!/bin/bash

echo "=== QZ Tray Setup Verification ==="
echo ""

echo "1. Checking certificate file..."
if [ -f "public/assets/ury/files/cert.pem" ]; then
    echo "   ✓ cert.pem exists"
    echo "   Size: $(wc -c < public/assets/ury/files/cert.pem) bytes"
else
    echo "   ✗ cert.pem NOT FOUND"
fi

echo ""
echo "2. Checking private key..."
if [ -f "src/privateKey.ts" ]; then
    echo "   ✓ privateKey.ts exists"
    if grep -q "BEGIN PRIVATE KEY" src/privateKey.ts; then
        echo "   ✓ Private key appears valid"
    else
        echo "   ✗ Private key appears empty or invalid"
    fi
else
    echo "   ✗ privateKey.ts NOT FOUND"
fi

echo ""
echo "3. Checking print-qz.ts..."
if [ -f "src/lib/print-qz.ts" ]; then
    echo "   ✓ print-qz.ts exists"
else
    echo "   ✗ print-qz.ts NOT FOUND"
fi

echo ""
echo "4. Checking dependencies..."
if grep -q "qz-tray" package.json; then
    echo "   ✓ qz-tray is in package.json"
else
    echo "   ✗ qz-tray NOT in package.json"
fi

if grep -q "jsrsasign" package.json; then
    echo "   ✓ jsrsasign is in package.json"
else
    echo "   ✗ jsrsasign NOT in package.json"
fi

echo ""
echo "=== Setup verification complete ==="
