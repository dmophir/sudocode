# Sudocode to GitHub Relationship Mapping

## API Version

All `gh api` calls require the header:

```
-H 'X-GitHub-Api-Version: 2026-03-10'
```

## Issue ID vs Issue Number

GitHub has two identifiers for issues:

| Field | Example | Used For |
|-------|---------|----------|
| Issue **number** | `42` | Display, URLs, `gh issue` commands, comments |
| Issue **ID** | `1234567890` | Sub-issues API, dependencies API |

The export script fetches the numeric ID after creating each issue via:

```bash
gh api repos/{owner}/{repo}/issues/{number} --jq '.id'
```

The ID is stored in `metadata.github_issue_id` in the `external_links` entry.

## Relationship Mapping

| Sudocode Relationship | GitHub Feature | Direction | API Endpoint |
|-----------------------|---------------|-----------|-------------|
| Parent-child (spec hierarchy) | Sub-Issues | Parent contains child | `POST /repos/{o}/{r}/issues/{parent_number}/sub_issues` |
| `implements` (issue -> spec) | Sub-Issues | Spec is parent, issue is child | `POST /repos/{o}/{r}/issues/{spec_number}/sub_issues` |
| `blocks` | Dependencies | A blocks B -> B blocked by A | `POST /repos/{o}/{r}/issues/{B_number}/dependencies/blocked_by` |
| `depends-on` | Dependencies | A depends-on B -> A blocked by B | `POST /repos/{o}/{r}/issues/{A_number}/dependencies/blocked_by` |
| `references` | Comment | Mention in comment | `POST /repos/{o}/{r}/issues/{number}/comments` |
| `related` | Comment | Mention in comment | `POST /repos/{o}/{r}/issues/{number}/comments` |
| `discovered-from` | Comment | Mention in comment | `POST /repos/{o}/{r}/issues/{number}/comments` |

## Example `gh api` Commands

### Sub-Issues (parent-child, implements)

```bash
# Make child_id a sub-issue of parent issue #42
gh api \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  -X POST \
  repos/{owner}/{repo}/issues/42/sub_issues \
  -F sub_issue_id=1234567890
```

**Note:** The `sub_issue_id` field takes the numeric **issue ID**, not the issue number.

### Dependencies (blocks, depends-on)

```bash
# Issue #10 (ID: 111) blocks issue #20
# -> issue #20 is blocked by issue #10
gh api \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  -X POST \
  repos/{owner}/{repo}/issues/20/dependencies/blocked_by \
  -F issue_id=111
```

**Note:** The `issue_id` field takes the numeric **issue ID** of the blocker.

### References (comment mention)

```bash
# Add a "Related" comment on issue #10 referencing #20
gh issue comment 10 \
  --repo owner/repo \
  --body "Related: #20"
```

## Limits

| Constraint | Limit |
|-----------|-------|
| Sub-issues per parent | 100 |
| Sub-issue nesting depth | 8 levels |
| Repo ownership | All issues must belong to repos owned by the same user/org |

## Idempotency

All relationship APIs are idempotent. Re-running the export is safe:

- **Sub-issues:** Returns an "already exists" error if the child is already a sub-issue of the parent
- **Dependencies:** Returns an "already exists" error if the dependency already exists
- **Comments:** The export script tracks posted feedback via content hash to avoid duplicate comments

The script detects "already exists" responses and treats them as success.

## Troubleshooting

### "Not Found" on sub-issues or dependencies

- Verify both issues exist and are in the same repository
- Verify you're using the numeric **issue ID** (not the issue number) for `sub_issue_id` and `issue_id` fields
- Verify the repository is owned by the same user/org

### "Validation Failed" on sub-issues

- The child issue may already be a sub-issue of a different parent (an issue can only have one parent)
- The nesting depth may exceed 8 levels
- The parent may already have 100 sub-issues

### "Validation Failed" on dependencies

- The dependency may create a circular dependency chain
- The issues may not be in repositories owned by the same user/org

### Rate limiting (HTTP 429)

The export script handles 429 responses with exponential backoff (base 1s, max 60s). If you hit persistent rate limits:

- Wait and retry
- Use `--dry-run` to verify the plan before making API calls
- Export smaller spec trees

### Incremental export skips everything

If all entities show as "skipped", the content hashes match. To force re-export:

```bash
uv run export_to_github.py --spec-id s-XXXX --repo owner/repo --force
```
