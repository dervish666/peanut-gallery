import { useRef, useEffect, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { CommentBubble } from './CommentBubble'
import type { CommentEvent } from '../../../shared/types'

interface CommentListProps {
  comments: CommentEvent[]
}

export function CommentList({ comments }: CommentListProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  // Assign sides by character — each character gets a stable side
  const characterSides = useMemo(() => {
    const sides = new Map<string, 'left' | 'right'>()
    let nextSide: 'left' | 'right' = 'left'
    for (const comment of comments) {
      if (!sides.has(comment.characterId)) {
        sides.set(comment.characterId, nextSide)
        nextSide = nextSide === 'left' ? 'right' : 'left'
      }
    }
    return sides
  }, [comments])

  return (
    <div
      className="flex flex-col gap-2.5 overflow-y-auto flex-1 py-2 scrollbar-thin overflow-x-hidden"
      style={{ paddingLeft: 4, paddingRight: 4 }}
    >
      <AnimatePresence initial={false}>
        {comments.map((comment) => (
          <CommentBubble
            key={comment.id}
            comment={comment}
            side={characterSides.get(comment.characterId) || 'left'}
          />
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  )
}
