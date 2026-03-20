---
name: clean-skill
description: A clean skill with no malicious patterns for testing
---

# Clean Skill Test Sample

This is a legitimate skill with no security issues.

## Usage

```typescript
// Normal TypeScript code
const apiKey = process.env.OPENAI_API_KEY

// Safe file operations
import fs from 'fs'
const data = fs.readFileSync('config.json', 'utf-8')

// Normal image handling (base64 data URI - should be whitelisted)
const imageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// Solana wallet integration (legitimate use of base64)
import { verify } from '@solana/web3.js'
const isValid = verify(message, signature, publicKey)

// JWT handling (legitimate)
import jwt from 'jsonwebtoken'
const token = jwt.sign({ userId: '123' }, process.env.JWT_SECRET!)
```

## Features

- Environment variable usage (secure)
- Standard file operations
- Legitimate cryptographic operations
- No hardcoded secrets
