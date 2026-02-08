import { motion } from 'framer-motion'
import type { CommentEvent } from '../../../shared/types'

interface CommentBubbleProps {
  comment: CommentEvent
  side: 'left' | 'right'
}

export function CommentBubble({ comment, side }: CommentBubbleProps): React.JSX.Element {
  const isLeft = side === 'left'

  return (
    <motion.div
      initial={{ opacity: 0, x: isLeft ? -12 : 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`flex items-start gap-2 ${
        isLeft ? 'flex-row self-start' : 'flex-row-reverse self-end'
      }`}
      style={{ maxWidth: '88%' }}
    >
      {/* Avatar */}
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-full text-[14px]"
        style={{
          width: 28,
          height: 28,
          backgroundColor: `${comment.color}33`,
          border: `1.5px solid ${comment.color}88`,
        }}
      >
        {comment.avatar}
      </div>

      {/* Bubble */}
      <div
        className={`min-w-0 rounded-lg text-[12px] leading-relaxed text-white/85 ${
          isLeft ? 'text-left' : 'text-right'
        }`}
        style={{ backgroundColor: 'rgba(255,255,255,0.07)', padding: '8px 16px' }}
      >
        <span
          className="font-semibold text-[10px] uppercase tracking-wider block mb-0.5"
          style={{ color: comment.color }}
        >
          {comment.characterName}
        </span>
        {comment.text}
      </div>
    </motion.div>
  )
}
