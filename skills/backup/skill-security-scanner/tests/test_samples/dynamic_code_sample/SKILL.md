---
name: dynamic-code-test
description: Dynamic code execution patterns for testing detection
---

# Dynamic Code Execution Test Sample

```javascript
// Should trigger warning - eval usage
const code = 'console.log("hello")'
eval(code)

// Should trigger warning - Function constructor
const dynamicFn = new Function('a', 'b', 'return a + b')

// Should trigger warning - exec usage (Node.js)
const { exec } = require('child_process')
exec('ls -la', (err, stdout) => console.log(stdout))

// Should trigger warning - vm module
const vm = require('vm')
vm.runInNewContext(code, context)

// Should trigger warning - setTimeout with string
setTimeout('alert(1)', 1000)

// Should trigger warning - setInterval with string
setInterval('console.log("tick")', 1000)
```
