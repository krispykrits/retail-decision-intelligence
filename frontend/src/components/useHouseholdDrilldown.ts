import { useEffect, useRef, useState } from 'react'

export function useHouseholdDrilldown<T extends { household_id: string }>(rows?: readonly T[]) {
  const [selectedId, setSelectedId] = useState<string>()
  const backButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const selected = rows?.find((row) => row.household_id === selectedId)

  useEffect(() => {
    if (selected) {
      backButton.current?.focus({ preventScroll: true })
    } else if (opener.current) {
      opener.current.focus({ preventScroll: true })
      opener.current = null
    }
  }, [selected])

  function open(householdId: string, trigger: HTMLButtonElement) {
    opener.current = trigger
    setSelectedId(householdId)
  }

  return { selected, backButton, open, close: () => setSelectedId(undefined) }
}
