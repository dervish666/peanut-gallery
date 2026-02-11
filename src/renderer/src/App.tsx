import { useState } from 'react'
import { CommentList } from './components/CommentList'
import { NowShowingBanner } from './components/NowShowingBanner'
import { SettingsDrawer } from './components/SettingsDrawer'
import { TheatreFrame } from './components/TheatreFrame'
import { useComments } from './hooks/useComments'
import { useNowShowing } from './hooks/useNowShowing'
import { useSettings } from './hooks/useSettings'

function App(): React.JSX.Element {
  const { comments } = useComments()
  const { nowShowing } = useNowShowing()
  const { settings, presets, isLoading, saveSettings } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <TheatreFrame>
      <div className="relative flex flex-col h-full">
        {/* Drag region over the curtain top area */}
        <div
          className="absolute top-0 left-0 right-0 z-20"
          style={
            {
              height: 24,
              marginTop: -70,
              marginLeft: -35,
              marginRight: -35,
              WebkitAppRegion: 'drag',
            } as React.CSSProperties
          }
        />

        {/* Header controls — positioned in the curtain-top zone */}
        <div
          className="absolute z-20 flex items-center justify-between"
          style={{ top: -50, left: -20, right: -20 }}
        >
          <button
            onClick={() => window.api.minimize()}
            className="text-yellow-200/50 hover:text-yellow-200/80 text-[15px] leading-none transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {'\u2212'}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-yellow-200/50 hover:text-yellow-200/80 text-[15px] leading-none transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {'\u2699'}
          </button>
        </div>

        {/* Now Showing banner */}
        <NowShowingBanner event={nowShowing} />

        {/* Comment feed */}
        <CommentList comments={comments} />

        {/* Empty state */}
        {comments.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-white/30 text-sm text-center px-8">
              Waiting for conversation to heckle...
            </p>
          </div>
        )}

        {/* Settings drawer */}
        {!isLoading && settings && (
          <SettingsDrawer
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            settings={settings}
            presets={presets}
            onSave={saveSettings}
          />
        )}
      </div>
    </TheatreFrame>
  )
}

export default App
