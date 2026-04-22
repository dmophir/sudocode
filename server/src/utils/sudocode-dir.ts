/**
 * @deprecated This utility uses SUDOCODE_DIR env var and cwd fallback, which are
 * not suitable for project-sensitive paths in a multi-project server.
 * For project-scoped operations, use ProjectRegistry.getSudocodeDir(projectPath)
 * or resolve via project_id from the registry instead.
 *
 * Retained only for non-project-context fallback in export.ts.
 */

import * as path from "path";

export function getSudocodeDir(): string {
  return process.env.SUDOCODE_DIR || path.join(process.cwd(), ".sudocode");
}
