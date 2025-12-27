# Three-Way Merge Integration Test Results

## Summary

**Test File:** `cli/tests/integration/three-way-merge-scenarios.test.ts`
**Total Tests:** 22
**Passing:** 11 (50%)
**Failing:** 11 (50%)

## Purpose

These integration tests verify end-to-end YAML three-way merge scenarios that users would encounter in real git merge situations. The tests are designed to catch the bugs identified in issues i-1mnm and i-3dcj.

## Test Results by Category

### ✅ Passing Tests (11)

1. **Multi-line text fields**
   - ✅ `should create conflict for changes to same line` - Latest-wins works correctly

2. **Metadata fields**
   - ✅ `should resolve conflict with latest-wins when both modified` - Latest-wins applies correctly
   - ✅ `should handle title changes in both branches` - Latest-wins for title field

3. **Array fields**
   - ✅ `should merge tags from both branches (union)` - Tag union works
   - ✅ `should merge relationships from both branches` - Relationship union works
   - ✅ `should handle feedback arrays` - Feedback union works

4. **Edge cases**
   - ✅ `should handle empty base (both added)` - Latest-wins for new entities
   - ✅ `should handle deletion in one branch, modification in other` - Modification wins
   - ✅ `should handle nested arrays in relationships` - Complex relationship merging
   - ✅ `should handle completely empty arrays` - Empty arrays preserved

5. **Performance and stability**
   - ✅ `should handle realistic multi-entity merge scenario` - Complex merge works

### ❌ Failing Tests (11)

#### 1. Multi-line text merging (3 failures) - **CRITICAL**

These failures indicate that **line-level merging is NOT working**. Changes to different lines in the same multi-line field are NOT being preserved.

- ❌ `should preserve changes to different lines`
  - **Expected:** Both "Line 1 MODIFIED" and "Line 3 MODIFIED" preserved
  - **Actual:** Only "Line 3 MODIFIED" (theirs) - ours change lost!
  - **Root Cause:** Likely i-3dcj - metadata merged before git merge-file sees differences

- ❌ `should handle additions at different positions`
  - **Expected:** Both "Added by OURS" and "Added by THEIRS"
  - **Actual:** Only "Added by THEIRS" - ours addition lost!

- ❌ `should handle multi-paragraph changes in different sections`
  - **Expected:** Both "UPDATED introduction" and "UPDATED conclusion"
  - **Actual:** Only theirs changes preserved

**Impact:** This is the PRIMARY use case for YAML three-way merge! If this doesn't work, the entire YAML merge implementation is ineffective.

#### 2. Metadata field merging (2 failures) - **CRITICAL**

These failures confirm bug i-3dcj: metadata is being merged BEFORE git merge-file, preventing proper three-way merge semantics.

- ❌ `should preserve change when only one branch modified`
  - **Expected:** `status: 'in_progress'` (only ours changed it)
  - **Actual:** `status: 'open'` (theirs unchanged value wins!)
  - **Root Cause:** i-3dcj - metadata merged before YAML, git never sees the change

- ❌ `should handle multiple metadata changes`
  - **Expected:** `priority: 1` (only ours changed it)
  - **Actual:** `priority: 2` (base/theirs value)
  - **Root Cause:** Same - pre-merge masks changes from git

**Impact:** Even simple metadata changes that should auto-merge are failing!

#### 3. resolve-conflicts vs merge-driver (1 failure) - **CRITICAL**

- ❌ `should produce identical results for same conflict`
  - **Error:** `Failed to parse JSON at line 1: Unexpected token '<', "<<<<<<< HEAD"`
  - **Root Cause:** i-1mnm - `resolve-conflicts` tries to read conflicted file as JSONL
  - **Impact:** This test can't even run until i-1mnm is fixed!

**This confirms i-1mnm:** The `resolve-conflicts` command doesn't use three-way merge at all.

#### 4. Large/complex scenarios (5 failures)

- ❌ `should handle very long text (> 1000 lines)`
  - Same issue as multi-line tests - changes not preserved

- ❌ `should handle unicode in multi-line text`
  - Same issue - only theirs changes preserved

- ❌ `should handle same UUID with different IDs`
  - **Expected:** 2 entities (one renamed)
  - **Actual:** 1 entity (merged when they shouldn't be)

- ❌ `should handle missing optional fields`
  - **Expected:** `assignee: 'alice'` from ours
  - **Actual:** `assignee: undefined`
  - **Root Cause:** Optional fields not merged correctly

- ❌ `should maintain data integrity through multiple merges`
  - **Expected:** Title updates preserved through chained merges
  - **Actual:** Title reverted to base

## Root Cause Analysis

### Bug i-3dcj: Metadata merged before git merge-file

**Evidence from failing tests:**
1. Multi-line text tests fail - changes to different lines NOT preserved
2. Metadata tests fail - git doesn't see scalar field changes
3. Only latest-wins scenarios pass (those that don't rely on git three-way merge)

**Why this breaks three-way merge:**

```typescript
// CURRENT (WRONG):
const metadataMerged = mergeMetadata([base, ours, theirs]); // Merges EVERYTHING
const baseWithMetadata = { ...base, ...metadataMerged }; // All three versions IDENTICAL now!
const oursWithMetadata = { ...ours, ...metadataMerged };
const theirsWithMetadata = { ...theirs, ...metadataMerged };

// Convert to YAML - all three have SAME metadata!
const baseYaml = toYaml(baseWithMetadata);
const oursYaml = toYaml(oursWithMetadata);
const theirsYaml = toYaml(theirsWithMetadata);

// Git merge-file sees no differences in metadata!
mergeYamlContent({ base: baseYaml, ours: oursYaml, theirs: theirsYaml });
```

**Result:** Git merge-file can't auto-merge changes because it doesn't see the differences!

### Bug i-1mnm: resolve-conflicts uses two-way merge

**Evidence:**
- Test can't even run - fails trying to parse conflict markers as JSONL
- `resolve-conflicts` calls `resolveEntities` (two-way) instead of `mergeThreeWay` (three-way)

**Impact:** Manual conflict resolution doesn't benefit from YAML three-way merge at all.

## Recommended Fixes

### Priority 1: Fix i-3dcj (Metadata Merge Timing)

**Option A: Don't merge metadata beforehand (RECOMMENDED)**

```typescript
// Just convert to YAML directly
const baseYaml = baseEntity ? toYaml(baseEntity) : "";
const oursYaml = toYaml(oursEntity);
const theirsYaml = toYaml(theirsEntity);

// Git merge-file sees ALL differences
const gitMergeResult = mergeYamlContent({ base: baseYaml, ours: oursYaml, theirs: theirsYaml });

// Resolve conflicts with latest-wins AFTER git merge
if (gitMergeResult.hasConflicts) {
  finalYaml = resolveConflicts(finalYaml, oursEntity, theirsEntity).content;
}
```

**Why this works:**
- Git sees actual differences in all fields (scalars AND arrays)
- Git auto-merges what it can
- Only genuine conflicts go to yaml-conflict-resolver
- Arrays might auto-merge correctly in YAML (each item on separate line)

**Option B: Only merge arrays, let git handle scalars**

```typescript
// Merge ONLY array fields (tags, relationships, feedback)
const arrayFieldsMerged = mergeArrayFields([base, ours, theirs]);

// Apply ONLY arrays - scalars stay different!
const baseWithArrays = { ...base, ...arrayFieldsMerged };
const oursWithArrays = { ...ours, ...arrayFieldsMerged };
const theirsWithArrays = { ...theirs, ...arrayFieldsMerged };

// Now git sees scalar differences!
```

### Priority 2: Fix i-1mnm (resolve-conflicts command)

**Make resolve-conflicts use three-way merge when possible:**

```typescript
async function resolveFile(filePath: string): Promise<void> {
  // Try to read base from git index
  const baseEntities = await readGitStage(filePath, 1); // stage 1 = base
  const oursEntities = await readGitStage(filePath, 2); // stage 2 = ours
  const theirsEntities = await readGitStage(filePath, 3); // stage 3 = theirs

  if (baseEntities) {
    // TRUE three-way merge with YAML
    const { entities } = mergeThreeWay(baseEntities, oursEntities, theirsEntities);
    await writeJSONL(filePath, entities);
  } else {
    // Fallback to two-way for edge cases
    const { entities } = resolveEntities([...oursEntities, ...theirsEntities]);
    await writeJSONL(filePath, entities);
  }
}
```

## Success Criteria

After fixes, these tests should pass:

1. ✅ All multi-line text tests (3 currently failing)
2. ✅ All metadata field tests (2 currently failing)
3. ✅ resolve-conflicts vs merge-driver comparison (1 currently failing)
4. ✅ Large/complex scenario tests (5 currently failing)

**Target: 22/22 tests passing (100%)**

## Next Steps

1. **Fix i-3dcj first** - This is blocking most tests
   - Try Option A (no pre-merge) first
   - If arrays don't merge well, fall back to Option B

2. **Re-run tests** - Verify multi-line merging works

3. **Fix i-1mnm** - Make resolve-conflicts use three-way merge

4. **Re-run tests** - All 22 should pass!

5. **Add more edge case tests** if needed

## Related Issues

- **i-3dcj:** `mergeThreeWay` applies merged metadata BEFORE git merge-file
- **i-1mnm:** `sudocode resolve-conflicts` doesn't use YAML three-way merge
- **s-2hpj:** YAML-Based Three-Way Merge spec (design document)
