/**
 * Voice input utility functions
 *
 * Provides browser permission handling and audio format detection
 * for the voice input feature.
 */

/**
 * Preferred MIME types for audio recording, in order of preference.
 * - audio/webm;codecs=opus offers the best quality/size ratio
 * - audio/webm is a fallback for browsers without opus support
 * - audio/ogg and audio/mp4 are additional fallbacks
 */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
]

/**
 * Check if the browser supports the Permissions API for microphone
 */
function supportsPermissionsApi(): boolean {
  return typeof navigator !== 'undefined' && 'permissions' in navigator
}

/**
 * Check if the browser supports MediaRecorder
 */
export function isMediaRecorderSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof navigator?.mediaDevices?.getUserMedia !== 'undefined'
}

/**
 * Check the current microphone permission state.
 *
 * Returns:
 * - true: Permission has been granted
 * - false: Permission has been denied
 * - null: Permission hasn't been requested yet (prompt state) or API not supported
 *
 * @example
 * ```ts
 * const hasPermission = await checkMicrophonePermission()
 * if (hasPermission === null) {
 *   // Need to prompt user
 * } else if (hasPermission) {
 *   // Can start recording
 * } else {
 *   // Permission denied
 * }
 * ```
 */
export async function checkMicrophonePermission(): Promise<boolean | null> {
  if (!supportsPermissionsApi()) {
    // Permissions API not supported - return null to indicate unknown
    return null
  }

  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })

    switch (result.state) {
      case 'granted':
        return true
      case 'denied':
        return false
      case 'prompt':
      default:
        return null
    }
  } catch {
    // Safari doesn't support querying microphone permission
    // Return null to indicate we need to try requesting it
    return null
  }
}

/**
 * Request microphone permission from the user.
 *
 * This will trigger the browser's permission prompt if permission
 * hasn't been granted yet.
 *
 * Returns:
 * - true: Permission was granted
 * - false: Permission was denied or an error occurred
 *
 * @example
 * ```ts
 * const granted = await requestMicrophonePermission()
 * if (granted) {
 *   // Can start recording
 * } else {
 *   // Show error message to user
 * }
 * ```
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (!isMediaRecorderSupported()) {
    return false
  }

  try {
    // Request access to trigger the permission prompt
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    // Immediately stop the stream - we just wanted to check/request permission
    stream.getTracks().forEach((track) => track.stop())

    return true
  } catch (error) {
    // NotAllowedError means user denied permission
    // Other errors (NotFoundError, etc.) also mean we can't record
    return false
  }
}

/**
 * Get the best supported MIME type for audio recording.
 *
 * Returns the first supported MIME type from the preferred list,
 * or an empty string if none are supported (MediaRecorder will use default).
 *
 * @example
 * ```ts
 * const mimeType = getSupportedMimeType()
 * const recorder = new MediaRecorder(stream, { mimeType })
 * ```
 */
export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return ''
  }

  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }

  // Return empty string to let MediaRecorder use its default
  return ''
}

/**
 * Check if a specific MIME type is supported for recording.
 *
 * @param mimeType - The MIME type to check (e.g., 'audio/webm')
 */
export function isMimeTypeSupported(mimeType: string): boolean {
  if (typeof MediaRecorder === 'undefined') {
    return false
  }
  return MediaRecorder.isTypeSupported(mimeType)
}
