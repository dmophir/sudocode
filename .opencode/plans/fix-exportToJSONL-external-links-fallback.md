# Fix: exportToJSONL external_links fallback

## Problem
When `exportToJSONL()` exports to a non-canonical directory (e.g., a temp dir), it can't find existing JSONL files to read `external_links` from. This causes the GitHub export script to treat all entities as "new" and create duplicate issues.

## Root Cause
`readExistingExternalLinks()` reads from the output directory's JSONL files. When exporting to a temp dir, those files don't exist, so `external_links` are lost.

## Fix: Self-healing fallback in `exportToJSONL()` (cli/src/export.ts)

### Change 1: Add path import (line 5)
```typescript
// BEFORE:
import type Database from "better-sqlite3";

// AFTER:
import path from "node:path";
import type Database from "better-sqlite3";
```

### Change 2: Add fallback logic (after line 252)

Change `const` to `let` for the link variables at lines 251-252, then add fallback:

```typescript
// BEFORE (lines 250-252):
  // Read existing external_links from JSONL files (to preserve them since SQLite doesn't store them)
  const existingSpecLinks = readExistingExternalLinks<SpecJSONL>(specsPath);
  const existingIssueLinks = readExistingExternalLinks<IssueJSONL>(issuesPath);

// AFTER:
  // Read existing external_links from JSONL files (to preserve them since SQLite doesn't store them)
  let existingSpecLinks = readExistingExternalLinks<SpecJSONL>(specsPath);
  let existingIssueLinks = readExistingExternalLinks<IssueJSONL>(issuesPath);

  // Fallback: if exporting to a non-canonical directory (e.g., temp dir),
  // try reading external_links from the canonical .sudocode/ directory.
  // db.name returns the database file path (e.g., /path/to/.sudocode/cache.db)
  if (existingSpecLinks.size === 0 && existingIssueLinks.size === 0) {
    const dbDir = path.dirname(db.name);
    if (dbDir !== outputDir) {
      const canonicalSpecLinks = readExistingExternalLinks<SpecJSONL>(`${dbDir}/${specsFile}`);
      const canonicalIssueLinks = readExistingExternalLinks<IssueJSONL>(`${dbDir}/${issuesFile}`);
      if (canonicalSpecLinks.size > 0) existingSpecLinks = canonicalSpecLinks;
      if (canonicalIssueLinks.size > 0) existingIssueLinks = canonicalIssueLinks;
    }
  }
```

### Why this works
- `db.name` is an officially documented better-sqlite3 property that returns the path passed to `new Database(path)` — already used in this codebase at `server/src/services/execution-service.ts:442`
- In this project, the database path is always absolute (e.g., `/path/to/.sudocode/cache.db`), so `path.dirname(db.name)` gives `/path/to/.sudocode`
- When outputDir IS the canonical dir, the fallback is a no-op (dbDir === outputDir)
- No changes needed to any of the 20 call sites
- No new parameters to ExportOptions

## Post-fix steps

1. Build TypeScript: `npx tsc` in `cli/`
2. Close 20 duplicate GitHub Issues in `metafeather-forks/upstream-sudocode`
3. Remove stale `external_links` from entities (the ones pointing to duplicate issues)
4. Re-run export with `--force` to validate
