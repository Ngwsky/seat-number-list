import { persistentAtom, persistentJSON } from "@nanostores/persistent"
import type { BlockSettings, PitchArea } from "../types/SeatNoList2Svg"

export const theme = persistentAtom("snl2svg_settings_theme")
export const seatNoListFileName = persistentAtom("snl2svg_settings_xlsx")
export const svgFileName = persistentAtom("snl2svg_settings_svg")
export const numericPrecision = persistentJSON(
  "snl2svg_settings_numericPrecision",
  2,
)
export const seatGap = persistentJSON("snl2svg_settings_seatGap", 0.05)
export const marginLeft = persistentJSON("snl2svg_settings_marginLeft", 0.4)
export const marginRight = persistentJSON("snl2svg_settings_marginRight", 0.4)
export const marginFront = persistentJSON("snl2svg_settings_marginFront", 0.4)
export const marginBack = persistentJSON("snl2svg_settings_marginBack", 0.4)
export const seatAlign = persistentAtom("snl2svg_settings_align", "center")
export const debugTextFontSize = persistentJSON(
  "snl2svg_settings_debugTextFontSize",
  0.24,
)
export const debugTextVisibility = persistentJSON(
  "snl2svg_settings_debugTextdebugTextVisibility",
  false,
)
export const blockSettings = persistentJSON<Record<string, BlockSettings>>(
  "snl2svg_settings_blocks",
  {},
)
export const pitchArea = persistentJSON<PitchArea>(
  "snl2svg_settings_pitchArea",
  {
    widthMinPct: 25,
    widthMaxPct: 75,
    heightMinPct: 40,
    heightMaxPct: 60,
  },
)
