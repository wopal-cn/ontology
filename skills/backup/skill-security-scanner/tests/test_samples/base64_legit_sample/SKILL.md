---
name: base64-legit-test
description: Legitimate Base64 usage for testing whitelist
---

# Base64 Legitimate Use Test Sample

```javascript
// Should be whitelisted - PNG image data URI
const pngImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// Should be whitelisted - JPEG image data URI
const jpegImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/'

// Should be whitelisted - Solana web3.js usage
import { PublicKey } from '@solana/web3.js'
const pubKey = new PublicKey(Buffer.from('seed string', 'base64'))

// Should be whitelisted - JWT decoding
import { jwtDecode } from 'jwt-decode'
const decoded = jwtDecode(token)

// Should be whitelisted - CryptoJS operations
import CryptoJS from 'crypto-js'
const decrypted = CryptoJS.AES.decrypt(ciphertext, key)
```
