import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { NowShowingEvent } from '../../../shared/types'

interface NowShowingBannerProps {
  event: NowShowingEvent | null
  replayTrigger?: number
}

const ROAST_DISPLAY_MS = 3500
const FALLBACK_DISMISS_MS = 8000

export function NowShowingBanner({ event, replayTrigger }: NowShowingBannerProps): React.JSX.Element {
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

  // Replay: re-show the banner when replayTrigger changes
  const [replayCount, setReplayCount] = useState(0)
  useEffect(() => {
    if (!replayTrigger || !displayEvent) return
    setReplayCount((c) => c + 1)
    setVisible(true)
  }, [replayTrigger]) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only trigger on replayTrigger

  // Auto-dismiss timer: starts when roast is present and banner is visible
  // replayCount in deps ensures timer resets on each replay
  useEffect(() => {
    if (!visible || roast === null) return

    const timer = setTimeout(() => setVisible(false), ROAST_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [visible, roast, replayCount])

  // Fallback dismiss: if roast never arrives, dismiss after FALLBACK_DISMISS_MS
  useEffect(() => {
    if (!visible || roast !== null) return

    const timer = setTimeout(() => setVisible(false), FALLBACK_DISMISS_MS)
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
          className="cursor-pointer select-none flex-shrink-0"
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
                      fontWeight: 700,
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
