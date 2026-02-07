import { useState, useEffect } from 'react'
import type { CommentEvent } from '../../../shared/types'

const MAX_COMMENTS = 50

export function useComments(): { comments: CommentEvent[] } {
  const [comments, setComments] = useState<CommentEvent[]>([])

  useEffect(() => {
    const unsubscribe = window.api.onComment((event) => {
      setComments((prev) => [...prev, event].slice(-MAX_COMMENTS))
    })
    return unsubscribe
  }, [])

  return { comments }
}
