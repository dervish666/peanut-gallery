import { motion } from 'framer-motion'
import type { CommentEvent } from '../../../shared/types'

interface CommentBubbleProps {
  comment: CommentEvent
}

export function CommentBubble({ comment }: CommentBubbleProps): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed text-white/85"
      style={{
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderLeft: `2px solid ${comment.color}`,
      }}
    >
      <span
        className="font-semibold text-[10px] uppercase tracking-wider mr-1.5"
        style={{ color: comment.color }}
      >
        {comment.characterName}
      </span>
      {comment.text}
    </motion.div>
  )
}
