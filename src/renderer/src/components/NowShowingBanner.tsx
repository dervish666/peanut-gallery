import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { NowShowingEvent } from '../../../shared/types'

interface NowShowingBannerProps {
  event: NowShowingEvent | null
}

const INITIAL_DISPLAY_MS = 4000
const RESHOW_DISPLAY_MS = 2500

export function NowShowingBanner({ event }: NowShowingBannerProps): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const [displayEvent, setDisplayEvent] = useState<NowShowingEvent | null>(null)
  const [lastConvId, setLastConvId] = useState<string | null>(null)
  const [showUntil, setShowUntil] = useState(0)

  // When event prop changes, compute display timing
  useEffect(() => {
    if (!event) return

    if (!event.isAiTitle) {
      setLastConvId(event.conversationId)
      setDisplayEvent(event)
      setShowUntil(Date.now() + INITIAL_DISPLAY_MS)
      setVisible(true)
    } else if (event.conversationId === lastConvId) {
      setDisplayEvent(event)
      setShowUntil(Date.now() + RESHOW_DISPLAY_MS)
      setVisible(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lastConvId is intentionally excluded to avoid re-triggering
  }, [event])

  // Auto-dismiss timer driven by showUntil
  useEffect(() => {
    if (!visible || showUntil === 0) return

    const remaining = showUntil - Date.now()
    if (remaining <= 0) {
      setVisible(false)
      return
    }

    const timer = setTimeout(() => setVisible(false), remaining)
    return () => clearTimeout(timer)
  }, [visible, showUntil])

  const dismiss = useCallback((): void => {
    setShowUntil(0)
    setVisible(false)
  }, [])

  const starring =
    displayEvent && displayEvent.characterNames.length > 0
      ? displayEvent.characterNames.join(' & ')
      : null

  return (
    <AnimatePresence>
      {visible && displayEvent && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={dismiss}
          className="absolute top-0 left-0 right-0 cursor-pointer select-none"
          style={{ zIndex: 5 }}
        >
          <div
            className="px-4 py-3 text-center"
            style={{
              background: 'rgba(10, 10, 10, 0.88)',
              borderBottom: '2px solid #c8a44e',
            }}
          >
            <div
              className="text-[10px] tracking-[0.25em] uppercase mb-1"
              style={{ color: '#c8a44e', fontVariant: 'small-caps' }}
            >
              Now Showing
            </div>
            <div
              className="text-base leading-tight mb-1"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontWeight: 700,
                color: '#e8c960',
              }}
            >
              {displayEvent.title}
            </div>
            {starring && (
              <div className="text-[11px]" style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
                Starring {starring}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
