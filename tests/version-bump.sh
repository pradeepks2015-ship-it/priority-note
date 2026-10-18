#!/bin/sh
# Fails when index.html or sw.js changed since BASE but version.json did not.
# Usage: sh tests/version-bump.sh <base-commit>
BASE="$1"
if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then echo "तुलना के लिए पुराना commit नहीं, जाँच छोड़ी"; exit 0; fi
if git diff --quiet "$BASE" HEAD -- index.html sw.js; then echo "ऐप की फ़ाइलें नहीं बदलीं"; exit 0; fi
if git diff --quiet "$BASE" HEAD -- version.json; then
  echo "FAIL: index.html/sw.js बदली पर संस्करण नहीं बढ़ा — APP_V, APP_NOTES (index.html) और version.json बदलें"; exit 1
fi
echo "PASS: संस्करण बढ़ा: $(git show "$BASE":version.json 2>/dev/null | tr -d '\n ') → $(tr -d '\n ' < version.json)"
