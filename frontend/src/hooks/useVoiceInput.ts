import { useState, useCallback, useRef, useEffect } from 'react'
import type { VoiceInputState, VoiceInputError, TranscriptionResult } from '@sudocode-ai/types'
import {
  checkMicrophonePermission,
  requestMicrophonePermission,
  getSupportedMimeType,
  isMediaRecorderSupported,
} from '@/lib/voice'

/**
 * API function to transcribe audio
 * Sends audio blob to the server for transcription
 */
async function transcribeAudio(audio: Blob, language = 'en'): Promise<TranscriptionResult> {
  const formData = new FormData()
  formData.append('audio', audio)
  formData.append('language', language)

  const response = await fetch('/api/voice/transcribe', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Transcription failed' }))
    throw new Error(error.message || 'Transcription failed')
  }

  return response.json()
}

/**
 * Options for the useVoiceInput hook
 */
export interface UseVoiceInputOptions {
  /** Language code for transcription (default: 'en') */
  language?: string
  /** Callback when transcription completes successfully */
  onTranscription?: (text: string) => void
  /** Callback when an error occurs */
  onError?: (error: VoiceInputError) => void
  /** Audio MIME type (default: 'audio/webm') */
  mimeType?: string
}

/**
 * Return type for useVoiceInput hook
 */
export interface UseVoiceInputReturn {
  /** Current state of the voice input */
  state: VoiceInputState
  /** Error object if in error state */
  error: VoiceInputError | null
  /** Last transcription result (null if none yet) */
  transcription: string | null
  /** Recording duration in seconds */
  recordingDuration: number
  /** Start recording audio */
  startRecording: () => Promise<void>
  /** Stop recording and return transcription */
  stopRecording: () => Promise<string>
  /** Cancel recording without transcribing */
  cancelRecording: () => void
  /** Clear the current transcription */
  clearTranscription: () => void
  /** Whether microphone permission has been granted */
  hasPermission: boolean | null
  /** Request microphone permission */
  requestPermission: () => Promise<boolean>
  /** Whether the browser supports audio recording */
  isSupported: boolean
  /**
   * @deprecated Use recordingDuration instead
   */
  duration: number
}

/**
 * Hook for handling voice input with MediaRecorder and transcription
 *
 * @example
 * ```tsx
 * function VoiceButton() {
 *   const {
 *     state,
 *     startRecording,
 *     stopRecording,
 *     error,
 *     duration
 *   } = useVoiceInput({
 *     onTranscription: (text) => setPrompt(text),
 *     onError: (err) => console.error(err)
 *   })
 *
 *   return (
 *     <button
 *       onClick={state === 'recording' ? stopRecording : startRecording}
 *       disabled={state === 'transcribing'}
 *     >
 *       {state === 'recording' ? `Recording... ${duration}s` : 'Record'}
 *     </button>
 *   )
 * }
 * ```
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { language = 'en', onTranscription, onError, mimeType } = options

  const [state, setState] = useState<VoiceInputState>('idle')
  const [error, setError] = useState<VoiceInputError | null>(null)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [duration, setDuration] = useState(0)
  const [transcription, setTranscription] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  // Check if MediaRecorder is supported
  const isSupported = isMediaRecorderSupported()

  // Check permission status on mount
  useEffect(() => {
    checkMicrophonePermission().then(setHasPermission)
  }, [])

  // Cleanup function
  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
    setDuration(0)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  /**
   * Start recording audio from the microphone
   */
  const startRecording = useCallback(async () => {
    if (!isSupported) {
      const err: VoiceInputError = {
        code: 'not_supported',
        message: 'Audio recording is not supported in this browser',
      }
      setError(err)
      setState('error')
      onError?.(err)
      return
    }

    // Reset state
    setError(null)
    chunksRef.current = []

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setHasPermission(true)

      // Determine best MIME type - use provided or auto-detect
      const actualMimeType = mimeType || getSupportedMimeType()

      // Create MediaRecorder
      const recorder = new MediaRecorder(stream, actualMimeType ? { mimeType: actualMimeType } : undefined)
      mediaRecorderRef.current = recorder

      // Collect audio data
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      // Handle recording stop
      recorder.onstop = () => {
        // Data collection is handled in stopRecording
      }

      // Handle errors
      recorder.onerror = () => {
        const err: VoiceInputError = {
          code: 'transcription_failed',
          message: 'Recording failed',
        }
        setError(err)
        setState('error')
        onError?.(err)
        cleanup()
      }

      // Start recording
      recorder.start(100) // Collect data every 100ms for smoother handling
      setState('recording')

      // Start duration timer
      startTimeRef.current = Date.now()
      durationIntervalRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 100)
    } catch (err) {
      let voiceError: VoiceInputError

      if (err instanceof Error && err.name === 'NotAllowedError') {
        voiceError = {
          code: 'permission_denied',
          message: 'Microphone access was denied. Please allow microphone access to use voice input.',
        }
        setHasPermission(false)
      } else {
        voiceError = {
          code: 'transcription_failed',
          message: err instanceof Error ? err.message : 'Failed to start recording',
        }
      }

      setError(voiceError)
      setState('error')
      onError?.(voiceError)
      cleanup()
    }
  }, [isSupported, mimeType, cleanup, onError])

  /**
   * Stop recording and transcribe the audio
   * @returns The transcribed text, or empty string if transcription failed or audio too short
   */
  const stopRecording = useCallback(async (): Promise<string> => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'recording') {
      return ''
    }

    // Stop the timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    return new Promise<string>((resolve) => {
      recorder.onstop = async () => {
        // Create blob from chunks
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })

        // Stop the media stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }

        // Don't transcribe if audio is too short (less than 0.5 seconds of data)
        if (audioBlob.size < 1000) {
          setState('idle')
          cleanup()
          resolve('')
          return
        }

        // Start transcription
        setState('transcribing')

        try {
          const result = await transcribeAudio(audioBlob, language)
          setState('idle')
          setTranscription(result.text)
          onTranscription?.(result.text)
          resolve(result.text)
        } catch (err) {
          const voiceError: VoiceInputError = {
            code: 'transcription_failed',
            message: err instanceof Error ? err.message : 'Transcription failed',
          }
          setError(voiceError)
          setState('error')
          onError?.(voiceError)
          resolve('')
        } finally {
          cleanup()
        }
      }

      recorder.stop()
    })
  }, [language, cleanup, onTranscription, onError])

  /**
   * Cancel recording without transcribing
   */
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.onstop = null // Prevent transcription
      mediaRecorderRef.current.stop()
    }
    cleanup()
    setState('idle')
    setError(null)
  }, [cleanup])

  /**
   * Clear the current transcription
   */
  const clearTranscription = useCallback(() => {
    setTranscription(null)
  }, [])

  /**
   * Request microphone permission
   * @returns true if permission was granted, false otherwise
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestMicrophonePermission()
    setHasPermission(granted)
    return granted
  }, [])

  return {
    state,
    error,
    transcription,
    recordingDuration: duration,
    startRecording,
    stopRecording,
    cancelRecording,
    clearTranscription,
    hasPermission,
    requestPermission,
    isSupported,
    // Deprecated - kept for backwards compatibility
    duration,
  }
}
