---
name: railway-debug
description: Debug Railway applications with comprehensive diagnostics
argument-hint: [service-or-issue]
allowed-tools: Bash(railway:*), mcp__Railway__*
---

## Railway Debugging Skill

This skill gathers comprehensive debugging information from Railway for your applications.

### What This Skill Does
1. Checks Railway CLI status and authentication
2. Shows current project/service linkage status
3. Lists recent deployments with their statuses
4. Fetches recent error and warning logs
5. Shows environment variables (names only for security)
6. Provides service health information

### Available MCP Tools
- `mcp__Railway__check-railway-status` - Verify CLI installation and auth
- `mcp__Railway__list-projects` - List all Railway projects
- `mcp__Railway__list-services` - List services in linked project
- `mcp__Railway__list-deployments` - Get deployment history with statuses
- `mcp__Railway__get-logs` - Fetch build or deploy logs (supports filtering)
- `mcp__Railway__list-variables` - Show environment variables

### Available CLI Commands
```
railway status --json              # Project/service linkage info
railway deployment list --json     # Recent deployments
railway logs -n 50 -f "@level:error"   # Last 50 error logs
railway logs -n 50 -f "@level:warn"    # Last 50 warning logs
railway logs -n 100 --build        # Build logs
railway variables --json           # Environment variables
railway service status             # Service health
```

### Log Filtering Syntax
- `@level:error` - Error level logs
- `@level:warn` - Warning level logs
- `@level:info` - Info level logs
- Text search: `"connection refused"` or `timeout`
- Combine: `@level:error AND database`

### Your Task
$ARGUMENTS

### Debugging Approach
1. First check `railway status` to confirm you're linked to the right project/environment
2. Use `railway deployment list` to see recent deployment statuses
3. If deployment failed, check build logs: `railway logs --build -n 100`
4. For runtime issues, check deploy logs: `railway logs -n 100 -f "@level:error"`
5. Verify environment variables are set correctly
6. Use MCP tools for structured data when parsing is needed
