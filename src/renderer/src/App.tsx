import { useState } from 'react'
import { CommentList } from './components/CommentList'
import { SettingsDrawer } from './components/SettingsDrawer'
import { useComments } from './hooks/useComments'
import { useSettings } from './hooks/useSettings'

function App(): React.JSX.Element {
  const { comments } = useComments()
  const { settings, presets, isLoading, saveSettings } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="relative flex flex-col h-full">
      {/* Drag region + gear button */}
      <div
        className="h-6 shrink-0 flex items-center justify-between px-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="w-5" />
        <div className="w-8 h-1 rounded-full bg-white/20" />
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-white/30 hover:text-white/60 text-[13px] leading-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {'\u2699'}
        </button>
      </div>

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
  )
}

export default App
