import { useEffect, useRef } from 'react'

export function useDetailsDisclosure() {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      const details = ref.current
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false
      }
    }

    document.addEventListener('pointerdown', dismiss, true)
    return () => document.removeEventListener('pointerdown', dismiss, true)
  }, [])

  function close() {
    if (ref.current) ref.current.open = false
  }

  return { ref, close }
}
