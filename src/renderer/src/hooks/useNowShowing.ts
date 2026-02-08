import { useState, useEffect } from 'react'
import type { NowShowingEvent } from '../../../shared/types'

export function useNowShowing(): { nowShowing: NowShowingEvent | null } {
  const [nowShowing, setNowShowing] = useState<NowShowingEvent | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.onNowShowing((event) => {
      setNowShowing(event)
    })
    return unsubscribe
  }, [])

  return { nowShowing }
}
