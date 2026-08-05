/**
 * The hidden half of the stage, wired to the channel: a `verify` signal comes down, the
 * stage runs the module in its sandboxed frame, and the result goes straight back up.
 */

import { useEffect, useRef } from 'react'
import { createVerifier } from '@stage/index.ts'
import type { Verifier, VerifyResult } from '@stage/index.ts'

export function useVerifier(onResult: (result: VerifyResult) => void): Verifier {
  const latest = useRef(onResult)
  useEffect(() => {
    latest.current = onResult
  })

  const verifier = useRef<Verifier | null>(null)
  verifier.current ??= createVerifier({ onResult: (result) => latest.current(result) })
  return verifier.current
}
