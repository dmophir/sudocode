/**
 * Executable Check Utilities
 *
 * Utilities for verifying if executables are available on the system.
 * Used for checking if agent CLIs (claude, copilot, etc.) are installed.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as which from 'which';

const execFileAsync = promisify(execFile);

/**
 * Result of an executable verification check
 */
export interface VerificationResult {
  /** Whether the executable is available */
  available: boolean;
  /** Path to the executable if found */
  path?: string;
  /** Version information if available */
  version?: string;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Check if an executable exists in PATH
 *
 * @param executableName - Name of the executable (e.g., 'claude', 'copilot')
 * @returns Promise<VerificationResult>
 */
export async function verifyExecutable(
  executableName: string
): Promise<VerificationResult> {
  try {
    // Use 'which' to find the executable in PATH
    const executablePath = await which.default(executableName);

    if (!executablePath) {
      return {
        available: false,
        error: `Executable '${executableName}' not found in PATH`,
      };
    }

    return {
      available: true,
      path: executablePath,
    };
  } catch (error) {
    return {
      available: false,
      error: `Executable '${executableName}' not found in PATH`,
    };
  }
}

/**
 * Verify an executable and attempt to get its version
 *
 * @param executableName - Name of the executable
 * @param versionArgs - Arguments to pass to get version (e.g., ['--version'])
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns Promise<VerificationResult>
 */
export async function verifyExecutableWithVersion(
  executableName: string,
  versionArgs: string[] = ['--version'],
  timeout: number = 5000
): Promise<VerificationResult> {
  // First check if executable exists
  const basicCheck = await verifyExecutable(executableName);
  if (!basicCheck.available) {
    return basicCheck;
  }

  // Try to get version info
  try {
    const { stdout, stderr } = await execFileAsync(
      executableName,
      versionArgs,
      {
        timeout,
        encoding: 'utf8',
      }
    );

    // Version info is usually in stdout, but some tools use stderr
    const versionOutput = (stdout || stderr).trim();

    return {
      available: true,
      path: basicCheck.path,
      version: versionOutput || 'unknown',
    };
  } catch (error) {
    // Even if version check fails, the executable exists
    return {
      available: true,
      path: basicCheck.path,
      version: 'unknown',
      error:
        error instanceof Error
          ? `Version check failed: ${error.message}`
          : 'Version check failed',
    };
  }
}
