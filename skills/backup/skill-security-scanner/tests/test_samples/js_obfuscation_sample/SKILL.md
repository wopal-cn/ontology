---
name: js-obfuscation-test
description: JavaScript obfuscation patterns for testing detection
---

# JavaScript Obfuscation Test Sample

```javascript
// Should trigger warning - hex escape sequences
const obfuscated1 = "\x61\x6c\x65\x72\x74\x28\x31\x29"

// Should trigger warning - unicode escapes
const obfuscated2 = "\u0061\u006c\u0065\u0072\u0074"

// Should trigger warning - fromCharCode
const obfuscated3 = String.fromCharCode(97, 108, 101, 114, 116)

// Should trigger warning - document.write
document.write('<script>alert(1)</script>')

// Should trigger warning - document.writeln
document.writeln('<img src=x onerror=alert(1)>')
```
