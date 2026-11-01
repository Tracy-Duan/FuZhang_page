import { useId } from 'react'
import type { LibraryCategory } from '../library'
import approvedArtwork from '../assets/library-wordmarks-approved-v2.png'

// Measured crops from the approved ImageGen board, preserving the exact letterforms.
// The board and prompt are versioned; no generated captions appear inside a button.
const crops: Record<LibraryCategory, [number, number, number, number]> = {
  forms: [98, 203, 628, 275],
  stories: [767, 203, 630, 275],
  research: [1441, 203, 631, 275],
}

export function LibrarySeal({ category }: { category: LibraryCategory }) {
  const id = useId()
  const [x, y, width, height] = crops[category]
  return <svg className="library-seal" viewBox={`${x} ${y} ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <filter id={`${id}-ink`} colorInterpolationFilters="sRGB">
        {/* Turn the pale board into a transparent mask at render time. */}
        <feColorMatrix type="matrix" values="-.361 -1.216 -.123 0 1.6 -.361 -1.216 -.123 0 1.6 -.361 -1.216 -.123 0 1.6 0 0 0 1 0" />
      </filter>
      <mask id={`${id}-mark`} maskUnits="userSpaceOnUse" x={x} y={y} width={width} height={height} style={{ maskType: 'luminance' }}>
        <image href={approvedArtwork} width="2172" height="724" filter={`url(#${id}-ink)`} />
      </mask>
    </defs>
    <rect x={x} y={y} width={width} height={height} fill="currentColor" mask={`url(#${id}-mark)`} />
  </svg>
}
