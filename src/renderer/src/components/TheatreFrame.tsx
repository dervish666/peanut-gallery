import curtainTop from '../../assets/curtain-top.svg'
import curtainLeft from '../../assets/curtain-left.svg'
import curtainRight from '../../assets/curtain-right.svg'
import railing from '../../assets/railing.svg'

interface TheatreFrameProps {
  children: React.ReactNode
}

export function TheatreFrame({ children }: TheatreFrameProps): React.JSX.Element {
  return (
    <div className="relative w-full h-full" style={{ background: '#1A1A1A' }}>
      {/* Stage content area — inset from frame elements */}
      <div className="absolute inset-0" style={{ top: 70, left: 35, right: 35, bottom: 50 }}>
        {children}
      </div>

      {/* Curtain top — shifted down 2px to avoid clipping the valance gold bar */}
      <img
        src={curtainTop}
        className="absolute left-0 w-full z-10 pointer-events-none"
        style={{ top: 2, height: 70 }}
        alt=""
      />

      {/* Curtain left */}
      <img
        src={curtainLeft}
        className="absolute top-0 left-0 h-full z-10 pointer-events-none"
        style={{ width: 35 }}
        alt=""
      />

      {/* Curtain right */}
      <img
        src={curtainRight}
        className="absolute top-0 right-0 h-full z-10 pointer-events-none"
        style={{ width: 35 }}
        alt=""
      />

      {/* Gold railing at bottom */}
      <img
        src={railing}
        className="absolute left-0 w-full z-10 pointer-events-none"
        style={{ bottom: 5, height: 45 }}
        alt=""
      />
    </div>
  )
}
