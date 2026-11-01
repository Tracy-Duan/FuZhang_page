export interface VisibleViewport { left: number; top: number; width: number; height: number }
export interface CompanionAnchor { left: number; right: number; top: number }

export function companionPlacement(viewport: VisibleViewport, pet?: CompanionAnchor) {
  const { left: vx, top: vy, width: vw, height: vh } = viewport
  const width = Math.max(1, Math.min(320, vw - 24)), height = Math.max(1, Math.min(380, vh - 24))
  const anchor = pet || { left: vx + vw - 108, right: vx + vw - 12, top: vy + vh - 108 }
  const preferredLeft = vw < 700 ? anchor.left - width + 96 : anchor.right + width + 10 < vx + vw ? anchor.right + 10 : anchor.left - width - 10
  return {
    left: Math.max(vx + 12, Math.min(vx + vw - width - 12, preferredLeft)),
    top: Math.max(vy + 12, Math.min(vy + vh - height - 12, vw < 700 ? anchor.top - height - 8 : anchor.top - height / 2)),
    width, height,
  }
}
