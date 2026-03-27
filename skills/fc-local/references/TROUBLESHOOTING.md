# fc-local Troubleshooting Guide

When fc-cli commands fail or return unexpected results, follow this diagnostic workflow.

## Quick Diagnostics

```bash
# 1. Check service health
my-fc status          # Container status
my-fc health          # Full health check (API + scrape test)

# 2. Check recent logs
my-fc logs api 100    # API logs (last 100 lines)
my-fc logs playwright-service 100  # Playwright logs
```

## Common Issues

### Empty Content / Scrape Returns Nothing

**Symptoms**: `scrape` returns empty markdown

**Diagnosis**:
```bash
# Check playwright-service logs for errors
my-fc logs playwright-service 50

# Look for patterns:
# - "page is navigating and changing the content" → Anti-crawling
# - "Request sent failure status" → Connection blocked
# - "Safety check" → Bot detection
```

### API Not Responding

**Symptoms**: `curl: (7) Failed to connect to localhost port 3002`

**Diagnosis**:
```bash
my-fc status          # Check if api container is running
my-fc logs api 100    # Check for startup errors
```

**Solutions**:
```bash
my-fc restart         # Restart all services
# Or rebuild if code changed
my-fc build api
my-fc start
```

### Playwright Timeout

**Symptoms**: Logs show "timeout" or job hangs

**Diagnosis**:
```bash
# Check playwright-service health
docker compose ps playwright-service
my-fc logs playwright-service 50
```

**Solutions**:
1. Increase timeout: `fc-cli scrape <url> --timeout 120000`
2. Check if site is slow or has infinite loading
3. Restart playwright: `docker compose restart playwright-service`

## Deep Diagnosis

### View Full Container Logs

```bash
# All services
docker compose logs --tail=200

# Specific service with follow
docker compose logs -f api

# View in real-time
my-fc logs api 500
```

### Enter Container Shell

```bash
# API container
my-fc shell api

# Playwright container
my-fc shell playwright-service

# Inside container, check:
ls -la /app/dist      # Built code
cat /app/.env         # Environment (be careful with secrets)
ps aux                # Running processes
```

### Check Docker Resources

```bash
# Container resource usage
docker stats

# Disk usage
docker system df

# Clean up if needed
docker system prune
```

## Project-Level Debugging

The firecrawl project is at: `labs/fork/sampx/firecrawl/`

### Key Files to Check

| Issue | Check |
|-------|-------|
| API routing | `apps/api/src/routes/v2.ts` |
| Scrape logic | `apps/api/src/scraper/scrapeURL/` |
| Playwright engine | `apps/api/src/scraper/scrapeURL/engines/playwright/` |
| Error handling | `apps/api/src/lib/error.ts` |
| Logging config | `apps/api/src/lib/logger.ts` |

### Search Error Messages

```bash
cd labs/fork/sampx/firecrawl

# Find where error is thrown
grep -r "page is navigating" apps/api/

# Find log statements
grep -r "Scrape error" apps/

# Check recent commits
git log --oneline -20 apps/api/
```

### Local Development Testing

```bash
cd labs/fork/sampx/firecrawl

# Rebuild after code changes
my-fc build api

# Or rebuild specific service
docker compose build api
docker compose up -d api

# Check if changes applied
my-fc logs api 20
```

## Reporting Issues

When reporting issues to user, include:

1. **Error message**: Exact output from fc-cli
2. **Service status**: `my-fc status` output
3. **Relevant logs**: `my-fc logs api 50` or playwright logs
4. **URL**: The URL that failed (if shareable)
5. **Reproduction**: Command that triggered the issue

## Decision Tree

```
fc-cli fails
    │
    ├─ Service not running?
    │   └─ my-fc start
    │
    ├─ Empty content?
    │   ├─ Check playwright logs
    │   └─ If anti-crawling → CDP fallback
    │
    ├─ Timeout?
    │   ├─ Increase --timeout
    │   └─ Check site responsiveness
    │
    └─ Other error?
        ├─ my-fc logs api 100
        └─ Check firecrawl project code
```
