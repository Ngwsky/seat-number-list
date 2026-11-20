let x: number | undefined = $state()
let y: number | undefined = $state()
let isShowPitchArea: boolean = $state(false)

export const venue = {
  get value() {
    return { x: x, y: y }
  },
  get x() {
    return x
  },
  get y() {
    return y
  },
  get isShowPitchArea() {
    return isShowPitchArea
  },
  set x(value) {
    x = value
  },
  set y(value) {
    y = value
  },
  set isShowPitchArea(value) {
    isShowPitchArea = value
  },
  reset() {
    x = undefined
    y = undefined
  },
}
