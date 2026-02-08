import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { NowShowingEvent } from '../../../shared/types'

interface NowShowingBannerProps {
  event: NowShowingEvent | null
}

const ROAST_DISPLAY_MS = 3500

export function NowShowingBanner({ event }: NowShowingBannerProps): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const [displayEvent, setDisplayEvent] = useState<NowShowingEvent | null>(null)
  const [roast, setRoast] = useState<string | null>(null)
  const [lastConvId, setLastConvId] = useState<string | null>(null)

  // When event prop changes, handle two-phase display
  useEffect(() => {
    if (!event) return

    if (event.roast === null) {
      // Phase 1: new conversation, show raw title, no auto-dismiss
      setLastConvId(event.conversationId)
      setDisplayEvent(event)
      setRoast(null)
      setVisible(true)
    } else if (event.conversationId === lastConvId) {
      // Phase 2: roast arrived for current conversation
      setRoast(event.roast)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lastConvId is intentionally excluded to avoid re-triggering
  }, [event])

  // Auto-dismiss timer: starts only after roast arrives
  useEffect(() => {
    if (!visible || roast === null) return

    const timer = setTimeout(() => setVisible(false), ROAST_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [visible, roast])

  const dismiss = useCallback((): void => {
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

            <AnimatePresence>
              {roast && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div
                    className="text-[9px] tracking-[0.15em] uppercase mt-1 mb-0.5"
                    style={{ color: 'rgba(200, 164, 78, 0.55)' }}
                  >
                    ✦ Otherwise Known As ✦
                  </div>
                  <div
                    className="text-sm leading-tight mb-1"
                    style={{
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontStyle: 'italic',
                      fontWeight: 400,
                      color: '#e8c960',
                    }}
                  >
                    &ldquo;{roast}&rdquo;
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {starring && (
              <div
                className={`text-[11px] ${roast === null ? 'animate-pulse' : ''}`}
                style={{ color: 'rgba(255, 255, 255, 0.45)' }}
              >
                Starring {starring}
                {roast === null ? '...' : ''}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
