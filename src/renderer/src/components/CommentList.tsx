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
    <div className="flex flex-col gap-2.5 overflow-y-auto flex-1 py-2 scrollbar-thin overflow-x-hidden" style={{ paddingLeft: 4, paddingRight: 4 }}>
      <AnimatePresence initial={false}>
        {comments.map((comment, index) => (
          <CommentBubble
            key={comment.id}
            comment={comment}
            side={index % 2 === 0 ? 'left' : 'right'}
          />
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  )
}
