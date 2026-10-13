import { persistentAtom, persistentJSON } from '@nanostores/persistent'

export const theme = persistentAtom('snl2svg_settings_theme')
export const seatNoListFileName = persistentAtom('snl2svg_settings_xlsx')
export const svgFileName = persistentAtom('snl2svg_settings_svg')
export const numericPrecision = persistentJSON('snl2svg_settings_numericPrecision', 2)
export const seatGap = persistentJSON('snl2svg_settings_seatGap', 0.05)
export const seatCircleRadius = persistentJSON('snl2svg_settings_seatCircleRadius', 0.5)
export const marginLeft = persistentJSON('snl2svg_settings_marginLeft', 0.4)
export const marginRight = persistentJSON('snl2svg_settings_marginRight', 0.4)
export const marginFront = persistentJSON('snl2svg_settings_marginFront', 0.4)
export const marginBack = persistentJSON('snl2svg_settings_marginBack', 0.4)