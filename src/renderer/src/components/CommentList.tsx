import { useRef, useEffect } from 'react'
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

  return (
    <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 px-4 py-2 scrollbar-thin">
      <AnimatePresence initial={false}>
        {comments.map((comment) => (
          <CommentBubble key={comment.id} comment={comment} />
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  )
}
