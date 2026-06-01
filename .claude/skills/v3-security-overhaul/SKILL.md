---
name: "V3 Security Overhaul"
description: "Comprehensive security remediation for claude-flow v3 addressing CVEs, weak password hashing, hardcoded credentials, and input validation. Use when fixing security vulnerabilities, implementing secure coding patterns, or achieving a 90/100 security score in TypeScript projects."
---

# V3 Security Overhaul

## What This Skill Does

Comprehensive security initiative addressing three critical CVEs and implementing secure coding patterns throughout claude-flow v3.

## Key Vulnerability Fixes

### CVE-1: Vulnerable Dependencies
```bash
npm update @anthropic-ai/claude-code@^2.0.31
```

### CVE-2: Weak Password Hashing
Replace SHA-256 with bcrypt (12 rounds):
```typescript
import bcrypt from 'bcrypt';

// Old (insecure)
const hash = crypto.createHash('sha256').update(password).digest('hex');

// New (secure)
const hash = await bcrypt.hash(password, 12);
const isValid = await bcrypt.compare(password, storedHash);
```

### CVE-3: Hardcoded Credentials
Use secure random generation:
```typescript
import crypto from 'crypto';

// Generate secure random secrets
const secret = crypto.randomBytes(32).toString('hex');
```

## Security Implementation Patterns

### Input Validation (Zod)
```typescript
import { z } from 'zod';

const inputSchema = z.object({
  content: z.string().max(10000),
  userId: z.string().uuid(),
});
```

### Path Sanitization
```typescript
function safePath(userInput: string, allowedPrefix: string): string {
  const resolved = path.resolve(allowedPrefix, userInput);
  if (!resolved.startsWith(allowedPrefix)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}
```

### Safe Command Execution
```typescript
import { execFile } from 'child_process';

// Never use exec() with user input
execFile('git', ['status'], { shell: false }, callback);
```

## Success Targets

- 90/100 security score
- Complete remediation of all three CVEs
- >95% test coverage for security-critical components
