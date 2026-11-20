<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import { tick } from "svelte"
  import { SVG } from "@svgdotjs/svg.js"
  import "@svgdotjs/svg.topoly.js"
  import { polySimplify } from "poly-simplify"
  import type {
    SeatNo,
    ConsecutiveSeats,
    Section,
    Block,
  } from "../types/SeatNoList2Svg"
  import SeatNoTable from "./SeatNoTable.svelte"
  import ConsecutiveSeatsTable from "./ConsecutiveSeatsTable.svelte"
  import SectionTable from "./SectionTable.svelte"
  import BlockTable from "./BlockTable.svelte"
  import { venue } from "../stores/venue.svelte"
  import {
    seatNoListFileName,
    svgFileName,
    numericPrecision,
    seatGap,
    marginLeft,
    marginRight,
    marginFront,
    marginBack,
    debugTextFontSize,
    debugTextVisibility,
    blockSettings,
    seatAlign,
    pitchArea,
  } from "../stores/settings"
  import {
    getConvexHullClockwise,
    getMinAreaBoundingBox,
    findMaxAreaQuadrilateral,
  } from "../utils/geometry"

  let alertMessage = $state("")
  let filesXlsx = $state<FileList>()
  let filesSvg = $state<FileList>()
  let isLoadingXlsx = $state<boolean>(false)
  let isLoadingSvg = $state<boolean>(false)
  let isGeneratingSeatCircles = $state<boolean>(false)
  let isInvalidFileXlsx = $state(false)
  let isInvalidFileSvg = $state(false)
  let svgContent = $state<Element>()
  let seatNoList: Array<SeatNo> = $state([])
  let isSvgLoaded = $state(false)
  let consecutiveSeatsList: Array<ConsecutiveSeats> = $state([])
  let sectionList: Array<Section> = $state([])
  let blockList: Array<Block> = $state.raw([])
  let openBlockPopover = $state<Function>()
  let svgElement: SVGSVGElement
  let snlWorker: Worker | null = null
  let svgWorker: Worker | null = null
  let blockWorker: Worker | null = null
  let blockWorkerMessageId = 0
  const blockWorkerPromises = new Map()
  let svgSeatsGroupElement: SVGGElement
  let svgDebugTextGroupElement: SVGGElement
  let svgDebugGroupElement: SVGGElement
  let svgPolygonPitchArea: SVGPolygonElement
  const pitchAreaPoints: Array<{ x: number; y: number }> = []
  let svgOriginalAttributes = new Map<string, string>()
  let svgOriginalViewBox = { x: 0, y: 0, width: 300, height: 300 }
  let svgCurrentViewBox = { x: 0, y: 0, w: 300, h: 300 }
  let isDragging = false
  let mousedownClientX = 0
  let mousedownClientY = 0
  let mousemoveClientX = 0
  let mousemoveClientY = 0
  const svgBlocksGroupId = "blocks"
  let beforeChangePitchAreaValue: Array<{ x: number; y: number }> = []

  async function getNewBlockDirecton(block: Block): Promise<Block> {
    const snapBlock = block // $state.snapshot(block)
    console.debug("getNewBlockDirecton:", snapBlock)
    const [obbFlClk, maqFlClk] = await Promise.all([
      sendToBlockWorker({
        points: snapBlock.obbPoints,
        pitchAreaPoints: pitchAreaPoints,
      }),
      sendToBlockWorker({
        points: snapBlock.maqPoints,
        pitchAreaPoints: pitchAreaPoints,
      }),
    ])
    console.debug("new block directions:", obbFlClk, maqFlClk)
    return {
      id: block.id,
      element: block.element,
      points: block.points,
      sections: block.sections,
      maqPoints: maqFlClk.pointsFromFrontLeftClockwise,
      maqLengthFLtoFR: maqFlClk.lengthFLtoFR,
      maqLenghtFLtoBL: maqFlClk.lengthFLtoBL,
      maqLengthBLtoBR: maqFlClk.lengthBLtoBR,
      maqUnitVectorFLtoFR: maqFlClk.unitVectorFLtoFR,
      maqUnitVectorFLtoBL: maqFlClk.unitVectorFLtoBL,
      obbPoints: obbFlClk.pointsFromFrontLeftClockwise,
      obbWidth: obbFlClk.lengthFLtoFR,
      obbHeight: obbFlClk.lengthFLtoBL,
      obbUnitVectorLtoR: obbFlClk.unitVectorFLtoFR,
      obbUnitVectorFtoB: obbFlClk.unitVectorFLtoBL,
      distToCenter: maqFlClk.distToCenter,
      unitVectorToCenter: maqFlClk.unitVectorToCenter,
      settings: block.settings,
    }
  }

  async function createBlockInfo(
    elm:
      | SVGRectElement
      | SVGPolygonElement
      | SVGPolylineElement
      | SVGPathElement,
  ): Promise<Block | undefined> {
    const dataName = (elm.getAttribute("data-name") ?? elm.getAttribute("id"))
      ?.replace(/^_/, "")
      .replace(/-[^-]*$/, "")

    if (
      !dataName ||
      dataName.split(":").length !== 2 ||
      dataName.startsWith(":") ||
      dataName.endsWith(":")
    )
      return

    if (elm instanceof SVGPathElement) {
      const path = SVG(elm)
      const poly = path.toPoly("1%", false)
      const polyElm = poly.node
      if (
        polyElm instanceof SVGPolygonElement ||
        polyElm instanceof SVGPolylineElement
      ) {
        // console.debug("poly: ", polyElm.getAttribute("points"))
        const simplified: Array<{ x: number; y: number }> = polySimplify(
          polyElm.getAttribute("points"),
          { quality: 0.9, RC: false },
        )
        const simplifiedPolygonElement = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon",
        )
        simplifiedPolygonElement.setAttribute(
          "points",
          simplified
            .map((p) => {
              return `${p.x},${p.y}`
            })
            .join(" "),
        )
        /*
        console.debug(
          "poly simplified: ",
          simplifiedPolygonElement.getAttribute("points"),
        )*/
        for (const attr of elm.attributes) {
          if (!["d", "pathLength"].includes(attr.name))
            simplifiedPolygonElement.setAttribute(attr.name, attr.value)
        }
        polyElm.remove()
        const parent = elm.parentElement
        parent?.replaceChild(simplifiedPolygonElement, elm)
        elm.remove()
        elm = simplifiedPolygonElement
      }
    }

    const points: Array<DOMPoint> = []
    const obbPts: Array<{ x: number; y: number }> = []
    const maqPts: Array<{ x: number; y: number }> = []

    if (elm instanceof SVGRectElement) {
      points.push(new DOMPoint(elm.x.baseVal.value, elm.y.baseVal.value))
      points.push(
        new DOMPoint(
          elm.x.baseVal.value + elm.width.baseVal.value,
          elm.y.baseVal.value,
        ),
      )
      points.push(
        new DOMPoint(
          elm.x.baseVal.value + elm.width.baseVal.value,
          elm.y.baseVal.value + elm.height.baseVal.value,
        ),
      )
      points.push(
        new DOMPoint(
          elm.x.baseVal.value,
          elm.y.baseVal.value + elm.height.baseVal.value,
        ),
      )
      const ctm = elm.getCTM()
      if (ctm) {
        points.forEach((p) => {
          p = p.matrixTransform(ctm)
        })
      }
      // Rect の場合は OBB と MAQ は同じ点
      points.forEach((point) => {
        obbPts.push({ x: point.x, y: point.y })
        maqPts.push({ x: point.x, y: point.y })
      })
    } else if (
      elm instanceof SVGPolygonElement ||
      elm instanceof SVGPolylineElement
    ) {
      const ctm = elm.getCTM()
      for (const point of elm.points) {
        const p = new DOMPoint(point.x, point.y)
        if (ctm) {
          points.push(p.matrixTransform(ctm))
        } else {
          points.push(p)
        }
      }
      const hull = getConvexHullClockwise(points)
      const obb = getMinAreaBoundingBox(hull)
      obbPts.push(...obb)
      const maq = findMaxAreaQuadrilateral(hull)
      maqPts.push(...maq)
    }

    const bs = blockSettings.get()[elm.id]
    let st = undefined
    if (bs) {
      st = {
        gap: bs.gap,
        mf: bs.mf,
        mr: bs.mr,
        mb: bs.mb,
        ml: bs.ml,
        align: bs.align,
      }
    }

    // console.debug("ID:", elm.id, bs?.align)
    // st = {axis: "obb"}

    return getNewBlockDirecton({
      id: elm.id,
      element: elm,
      points: points,
      sections: [],
      maqPoints: maqPts,
      maqLengthFLtoFR: 0,
      maqLenghtFLtoBL: 0,
      maqLengthBLtoBR: 0,
      maqUnitVectorFLtoFR: { x: 1, y: 0 },
      maqUnitVectorFLtoBL: { x: 0, y: 1 },
      obbPoints: obbPts,
      obbWidth: 0,
      obbHeight: 0,
      obbUnitVectorLtoR: { x: 1, y: 0 },
      obbUnitVectorFtoB: { x: 0, y: 1 },
      distToCenter: 0,
      unitVectorToCenter: { x: 0, y: 1 },
      settings: st,
    })
  }

  function draggingFlgOff() {
    isDragging = false
  }

  function toggleVisibilityPitchArea(value?: boolean) {
    if (!svgElement) return
    const debugElement = svgElement.getElementById("snl2svg-debug")
    console.debug("toggleVisibilityPitchArea", value, debugElement)
    if (value === true) {
      if (!debugElement) svgElement.append(svgDebugGroupElement)
    } else {
      if (debugElement) {
        console.debug("removeChild", debugElement)
        svgElement.removeChild(debugElement)
      } else {
        if (value === undefined) svgElement.append(svgDebugGroupElement)
      }
    }
  }

  function regenerateBlocksSeatCircles(blocks: Array<Block>) {
    if (
      !blocks ||
      blocks.length < 1 ||
      !svgSeatsGroupElement ||
      !svgDebugTextGroupElement
    )
      return

    const gSeats = svgSeatsGroupElement
    const gDebug = svgDebugTextGroupElement

    if (!gSeats || !gDebug) return

    const errorGroupList = []
    const errorGroupNameList: Array<string> = []

    blocks.forEach((blk) => {
      if (blk.sections.length < 1) return

      const ml = marginLeft.get() + (blk.settings?.ml ?? 0)
      const mr = marginRight.get() + (blk.settings?.mr ?? 0)
      const mf = marginFront.get() + (blk.settings?.mf ?? 0)
      const mb = marginBack.get() + (blk.settings?.mb ?? 0)
      const gap = seatGap.get() + (blk.settings?.gap ?? 0)
      const algn = blk.settings?.align ?? seatAlign.get() ?? "center"
      const axis = blk.settings?.axis ?? "maq"
      const firstRowOuterWidth =
        axis === "obb" ? blk.obbWidth : blk.maqLengthFLtoFR
      const lastRowOuterWidth =
        axis === "obb" ? blk.obbWidth : blk.maqLengthBLtoBR
      const outerHeight = axis === "obb" ? blk.obbHeight : blk.maqLenghtFLtoBL
      const boxPoints = axis === "obb" ? blk.obbPoints : blk.maqPoints
      const unitVecLtoR =
        axis === "obb" ? blk.obbUnitVectorLtoR : blk.maqUnitVectorFLtoFR
      const unitVecFtoB =
        axis === "obb" ? blk.obbUnitVectorFtoB : blk.maqUnitVectorFLtoBL
      let minFirstRow = Infinity
      let maxLastRow = 0
      let minLeftX = Infinity
      let maxRightX = 0
      const rowMap = new Map<
        number,
        { leftmostX: number; rightmostX: number; innerWidth: number }
      >()
      blk.sections.forEach((sct) => {
        if (sct.firstRow < minFirstRow) minFirstRow = sct.firstRow
        if (maxLastRow < sct.lastRow) maxLastRow = sct.lastRow
        if (sct.minSeatX < minLeftX) minLeftX = sct.minSeatX
        if (maxRightX < sct.maxSeatX) maxRightX = sct.maxSeatX
        sct.consecutiveSeatsLists.forEach((csl) => {
          csl.forEach((cs) => {
            const lx = cs.leftmostSeat.seatIndex + cs.leftmostSeat.colOffset
            const rx = cs.rightmostSeat.seatIndex + cs.rightmostSeat.colOffset
            const rowInfo = rowMap.get(cs.row)
            if (rowInfo) {
              if (lx < rowInfo.leftmostX) {
                rowInfo.leftmostX = lx
              }
              if (rowInfo.rightmostX < rx) {
                rowInfo.rightmostX = rx
              }
            } else {
              rowMap.set(cs.row, {
                leftmostX: lx,
                rightmostX: rx,
                innerWidth: 0,
              })
            }
          })
        })
      })

      const rowCnt = maxLastRow - minFirstRow + 1
      const colCnt = maxRightX - minLeftX + 1
      const innerHeight = outerHeight - mf - mb
      const stepRow = innerHeight / rowCnt
      const firstRowInnerWidth = firstRowOuterWidth - ml - mr
      const lastRowInnerWidth = lastRowOuterWidth - ml - mr
      const innerWidthDiff = lastRowInnerWidth - firstRowInnerWidth
      const firstRowInnerWidthAtFront =
        firstRowInnerWidth + innerWidthDiff * (mf / outerHeight)
      const lastRowInnerWidthAtBack =
        lastRowInnerWidth - innerWidthDiff * (mb / outerHeight)
      const widthDiffPerRow =
        (lastRowInnerWidthAtBack - firstRowInnerWidthAtFront) / rowCnt
      console.debug(
        `${blk.id}: innerWidthDiff=${innerWidthDiff}, firstRowInnerWidthAtFront=${firstRowInnerWidthAtFront}, lastRowInnerWidthAtBack=${lastRowInnerWidthAtBack} widthDiffPerRow=${widthDiffPerRow}`,
      )

      let minWidthPerColRowNum = -1
      let minWidthPerColRowInnerWidth = -1
      let minWidthPerColRowColCnt = -1
      let minWidthPerColRowSeatWidth = Infinity
      for (let i = 0; i < rowCnt; i++) {
        const rowNum = minFirstRow + i
        const rowInfo = rowMap.get(rowNum)
        if (rowInfo) {
          const ncs = rowInfo.rightmostX - rowInfo.leftmostX + 1
          const wdt = firstRowInnerWidthAtFront + widthDiffPerRow * i
          const widthPerCol = wdt / ncs
          rowInfo.innerWidth = wdt
          if (widthPerCol < minWidthPerColRowSeatWidth) {
            minWidthPerColRowSeatWidth = widthPerCol
            minWidthPerColRowNum = rowNum
            minWidthPerColRowInnerWidth = wdt
            minWidthPerColRowColCnt = ncs
          }
        }
      }

      console.debug(
        `${blk.id}: r=${minWidthPerColRowNum}, w=${minWidthPerColRowInnerWidth}, c=${minWidthPerColRowColCnt} w/c=${minWidthPerColRowSeatWidth}`,
      )

      const innerWidth = minWidthPerColRowInnerWidth
      const stepSeat = innerWidth / minWidthPerColRowColCnt
      const radius =
        stepSeat < stepRow ? (stepSeat - gap / 2) / 2 : (stepRow - gap / 2) / 2
      if (radius <= 0) {
        errorGroupList.push(blk)
        errorGroupNameList.push(blk.id)
        return
      }
      const adjustSeat =
        gap / 4 + (stepRow < stepSeat ? (stepSeat - stepRow) / 2 : 0)
      const adjustRow =
        gap / 4 + (stepSeat < stepRow ? (stepRow - stepSeat) / 2 : 0)
      const stepSeatX = unitVecLtoR.x * stepSeat
      const stepSeatY = unitVecLtoR.y * stepSeat
      const stepRowX = unitVecFtoB.x * stepRow
      const stepRowY = unitVecFtoB.y * stepRow

      let startX =
        boxPoints[0].x +
        unitVecLtoR.x * (ml + radius + adjustSeat) +
        unitVecFtoB.x * (mf + radius + adjustRow)
      let startY =
        boxPoints[0].y +
        unitVecLtoR.y * (ml + radius + adjustSeat) +
        unitVecFtoB.y * (mf + radius + adjustRow)

      blk.sections.forEach((sct) => {
        sct.consecutiveSeatsLists.forEach((css) => {
          css.forEach((cs) => {
            let rowAdjustFactorX = 0
            let rowAdjustFactorY = 0
            const rowInfo = rowMap.get(cs.row)
            if (rowInfo) {
              let af = 0
              if (algn === "center") {
                af = 0.5
              } else if (algn === "right") {
                af = 1
              }
              const seatwidth = stepSeat * (rowInfo.rightmostX - minLeftX + 1)
              const wDiff = rowInfo.innerWidth - seatwidth
              const rowAdjustFactor = wDiff * af
              console.debug(
                `rowAdjustFactor=${rowAdjustFactor}, seatwidth=${seatwidth}, wDiff=${wDiff}`,
              )

              rowAdjustFactorX = unitVecLtoR.x * rowAdjustFactor
              rowAdjustFactorY = unitVecLtoR.y * rowAdjustFactor
            }
            cs.seatNoList.forEach((sn) => {
              const cx =
                startX +
                (sn.row - minFirstRow) * stepRowX +
                (sn.seatIndex + sn.colOffset - minLeftX) * stepSeatX +
                rowAdjustFactorX
              const cy =
                startY +
                (sn.row - minFirstRow) * stepRowY +
                (sn.seatIndex + sn.colOffset - minLeftX) * stepSeatY +
                rowAdjustFactorY
              const dataName = `${sn.area}:${sn.block}:${sn.row}:${sn.seatIndex}`
              const circle = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "circle",
              )
              circle.setAttribute("id", dataName)
              circle.setAttribute("data-name", dataName)
              circle.setAttribute("cx", cx.toFixed(numericPrecision.get()))
              circle.setAttribute("cy", cy.toFixed(numericPrecision.get()))
              circle.setAttribute("r", radius.toFixed(numericPrecision.get()))
              const oldSeatCircle = gSeats.querySelector(
                `#${CSS.escape(dataName)}`,
              )
              if (oldSeatCircle) oldSeatCircle.remove()
              gSeats.appendChild(circle)

              const text = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "text",
              )
              text.setAttribute("id", `rn_${dataName}`)
              text.setAttribute("x", cx.toFixed(numericPrecision.get()))
              text.setAttribute("y", cy.toFixed(numericPrecision.get()))
              text.setAttribute("text-anchor", "middle")
              text.setAttribute("dominant-baseline", "auto")
              text.setAttribute("font-size", debugTextFontSize.get().toFixed(2))
              const tspanRow = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "tspan",
              )
              tspanRow.setAttribute("dy", "-0.2em")
              tspanRow.textContent = sn.rowName
              text.append(tspanRow)
              const tspanSeat = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "tspan",
              )
              tspanSeat.setAttribute("x", cx.toFixed(numericPrecision.get()))
              tspanSeat.setAttribute("dy", "1.1em")
              tspanSeat.textContent = sn.seatName
              text.append(tspanSeat)
              const oldDebugText = gDebug.querySelector(
                `#rn_${CSS.escape(dataName)}`,
              )
              if (oldDebugText) oldDebugText.remove()
              gDebug.append(text)
            })
          })
        })
      })
    })

    if (0 < errorGroupList.length) {
      console.debug("error group: ", errorGroupNameList.join(", "))
      alertMessage = `${errorGroupList.length} ブロックの Seat Gap が大きすぎるため、座席を作成できませんでした。
        ${errorGroupNameList.join(", ")}`
    }
  }

  function regenerateAllSeatCircles() {
    if (!svgElement) return
    const seatsElement = svgElement.getElementById("seats")
    if (seatsElement) svgElement.removeChild(seatsElement)
    const debugTextElement = svgElement.getElementById("debug-text")
    if (debugTextElement) svgElement.removeChild(debugTextElement)
    const gSeats = document.createElementNS("http://www.w3.org/2000/svg", "g")
    const gDebugText = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    )
    gSeats.setAttribute("id", "seats")
    gDebugText.setAttribute("id", "debug-text")
    gDebugText.setAttribute("fill", "white")
    svgSeatsGroupElement = gSeats
    svgDebugTextGroupElement = gDebugText
    regenerateBlocksSeatCircles(blockList)
    svgElement.appendChild(gSeats)
    if (debugTextVisibility.get()) svgElement.appendChild(gDebugText)
  }

  function assignBlockToSection() {
    if (sectionList && blockList && $svgFileName && $seatNoListFileName) {
      const noBlockSectionList: Array<Section> = []
      sectionList = sectionList.map((s) => {
        const blockName =
          s.consecutiveSeatsLists[0][0].leftmostSeat.area +
          ":" +
          s.consecutiveSeatsLists[0][0].leftmostSeat.block
        const bls = blockList.filter((b) => {
          if (blockName === b.element.getAttribute("data-name")) return true
          if (b.element.id.includes(blockName)) return true
          return false
        })
        if (bls.length === 1) {
          s.blockElement = bls[0]
          bls[0].sections.push(s)
        } else if (1 < bls.length) {
          s.blockOptions = bls
          const notAssing = bls.find((b) => {
            return b.sections.length === 0
          })
          if (notAssing) {
            s.blockElement = notAssing
            notAssing.sections.push(s)
          } else {
            s.blockElement = bls[bls.length - 1]
            bls[bls.length - 1].sections.push(s)
          }
        } else {
          noBlockSectionList.push(s)
        }
        return s
      })
      if (0 < noBlockSectionList.length) {
        const sectionNames = noBlockSectionList.map((s) => {
          return (
            s.consecutiveSeatsLists[0][0].leftmostSeat.area +
            ":" +
            s.consecutiveSeatsLists[0][0].leftmostSeat.block
          )
        })
        alertMessage = `${noBlockSectionList.length} セクションに該当するブロックが見つかりませんでした。
        ${sectionNames.join(", ")}`
      }
    }
  }

  function svgOnMouseleave() {
    venue.reset()
  }

  function svgOnmousedown(ev: MouseEvent) {
    isDragging = true
    mousedownClientX = ev.clientX
    mousedownClientY = ev.clientY
    mousemoveClientX = ev.clientX
    mousemoveClientY = ev.clientY
  }

  function svgOnMousemove(ev: MouseEvent) {
    const dx = ev.clientX - mousemoveClientX
    const dy = ev.clientY - mousemoveClientY
    mousemoveClientX = ev.clientX
    mousemoveClientY = ev.clientY

    if (!svgElement) return

    if (isDragging) {
      const scaleX = svgCurrentViewBox.w / svgElement.clientWidth
      const scaleY = svgCurrentViewBox.h / svgElement.clientHeight
      svgCurrentViewBox.x -= dx * scaleX
      svgCurrentViewBox.y -= dy * scaleY
      svgElement.setAttribute(
        "viewBox",
        `${svgCurrentViewBox.x} ${svgCurrentViewBox.y} ${svgCurrentViewBox.w} ${svgCurrentViewBox.h}`,
      )
    } else {
      const rect = svgElement.getBoundingClientRect()
      const viewbox = svgElement.viewBox.baseVal
      const vbWidth = viewbox.width || rect.width
      const vbHeight = viewbox.height || rect.height
      const vbX = viewbox.x || 0
      const vbY = viewbox.y || 0
      const clientX = ev.clientX - rect.left
      const clientY = ev.clientY - rect.top
      const svgX = (clientX / rect.width) * vbWidth + vbX
      const svgY = (clientY / rect.height) * vbHeight + vbY
      venue.x = svgX
      venue.y = svgY
    }
  }

  function svgOnWheel(ev: WheelEvent) {
    if (!svgElement) return
    ev.preventDefault()
    const rect = svgElement.getBoundingClientRect()
    const clientX = ev.clientX - rect.left
    const clientY = ev.clientY - rect.top
    const zoomFactor = ev.deltaY < 0 ? 0.9 : 1.1
    const dw = svgCurrentViewBox.w * (1 - zoomFactor)
    const dh = svgCurrentViewBox.h * (1 - zoomFactor)
    if (
      svgCurrentViewBox.w * zoomFactor < 8 ||
      4000 < svgCurrentViewBox.w * zoomFactor
    )
      return
    svgCurrentViewBox.x += (clientX / rect.width) * dw
    svgCurrentViewBox.y += (clientY / rect.height) * dh
    svgCurrentViewBox.w *= zoomFactor
    svgCurrentViewBox.h *= zoomFactor
    svgElement.setAttribute(
      "viewBox",
      `${svgCurrentViewBox.x} ${svgCurrentViewBox.y} ${svgCurrentViewBox.w} ${svgCurrentViewBox.h}`,
    )
  }

  function createSvgElement(text: string) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, "image/svg+xml")
    const svgs = doc.getElementsByTagName("svg")

    if (!svgContent) throw Error("Not found parent element of svg.")

    if (svgs.length === 0) {
      throw Error(`File is not svg: ${text}`)
    }

    svgOriginalAttributes.clear()
    for (const attr of svgs[0].attributes) {
      svgOriginalAttributes.set(attr.name, attr.value)
    }

    svgOriginalViewBox = {
      x: svgs[0].viewBox.baseVal.x,
      y: svgs[0].viewBox.baseVal.y,
      width: svgs[0].viewBox.baseVal.width,
      height: svgs[0].viewBox.baseVal.height,
    }
    pitchAreaPoints.splice(0)
    pitchAreaPoints.push(
      {
        x:
          svgOriginalViewBox.x +
          svgOriginalViewBox.width * ($pitchArea.widthMinPct / 100),
        y:
          svgOriginalViewBox.y +
          svgOriginalViewBox.height * ($pitchArea.heightMinPct / 100),
      },
      {
        x:
          svgOriginalViewBox.x +
          svgOriginalViewBox.width * ($pitchArea.widthMaxPct / 100),
        y:
          svgOriginalViewBox.y +
          svgOriginalViewBox.height * ($pitchArea.heightMinPct / 100),
      },
      {
        x:
          svgOriginalViewBox.x +
          svgOriginalViewBox.width * ($pitchArea.widthMaxPct / 100),
        y:
          svgOriginalViewBox.y +
          svgOriginalViewBox.height * ($pitchArea.heightMaxPct / 100),
      },
      {
        x:
          svgOriginalViewBox.x +
          svgOriginalViewBox.width * ($pitchArea.widthMinPct / 100),
        y:
          svgOriginalViewBox.y +
          svgOriginalViewBox.height * ($pitchArea.heightMaxPct / 100),
      },
    )
    /* DOM に反映していない SVG Element では getCTM() が取得できないため、先に非表示で DOM に追加する。
     * If the current element is a non-rendered element, and the UA is not able to resolve the style of the element, then return null.
     * https://w3c.github.io/svgwg/svg2-draft/types.html#__svg__SVGGraphicsElement__getCTM
     */
    const tempSvgId = "temp_svg"
    svgs[0].id = tempSvgId
    svgs[0].style.position = "absolute"
    svgs[0].style.visibility = "hidden"
    svgs[0].style.width = "0"
    svgs[0].style.height = "0"

    svgContent.append(svgs[0])

    const svgElm = document.getElementById(tempSvgId)
    svgElm?.removeAttribute("id")
    if (!svgElm || !(svgElm instanceof SVGSVGElement))
      throw Error(`Not found svg element by ID: ${tempSvgId}`)

    const blocksGroup = svgElm.getElementById(svgBlocksGroupId)

    if (blocksGroup) {
      const promises = []
      const descendents = blocksGroup.querySelectorAll("*")
      for (const elm of [...descendents]) {
        if (
          elm instanceof SVGRectElement ||
          elm instanceof SVGPolygonElement ||
          elm instanceof SVGPathElement
        ) {
          promises.push(createBlockInfo(elm))
        } else {
          // Not target element type
          continue
        }
      }

      Promise.all(promises).then((results) => {
        const blks = results
          .filter((blk) => blk !== undefined)
          .sort((a, b) => {
            const an = a.element.getAttribute("data-name")
            const bn = a.element.getAttribute("data-name")
            if (an && bn) {
              const namediff = an.localeCompare(bn)
              if (namediff !== 0) return namediff
            }
            const ai = a.element.id
            const bi = b.element.id
            if (ai && bi) return ai.localeCompare(bi)
            return 0
          })
        blockList = blks
        assignBlockToSection()

        const polygonViewBox = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon",
        )
        polygonViewBox.setAttribute("id", "snl2svg-bg")
        polygonViewBox.setAttribute(
          "points",
          `${svgOriginalViewBox.x},${svgOriginalViewBox.y} ${svgOriginalViewBox.x + svgOriginalViewBox.width},${svgOriginalViewBox.y} ${svgOriginalViewBox.x + svgOriginalViewBox.width},${svgOriginalViewBox.y + svgOriginalViewBox.height} ${svgOriginalViewBox.x},${svgOriginalViewBox.y + svgOriginalViewBox.height}`,
        )
        polygonViewBox.setAttribute("stroke", "none")
        polygonViewBox.setAttribute("stroke-width", "1")
        polygonViewBox.setAttribute("fill", "white")
        svgElm.prepend(polygonViewBox)

        const gDebug = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "g",
        )
        gDebug.setAttribute("id", "snl2svg-debug")
        svgDebugGroupElement = gDebug
        const polygonPitchArea = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon",
        )
        polygonPitchArea.setAttribute("id", "snl2svg-pitch-area")
        polygonPitchArea.setAttribute(
          "points",
          `${pitchAreaPoints[0].x},${pitchAreaPoints[0].y} ${pitchAreaPoints[1].x},${pitchAreaPoints[1].y} ${pitchAreaPoints[2].x},${pitchAreaPoints[2].y} ${pitchAreaPoints[3].x},${pitchAreaPoints[3].y}`,
        )
        polygonPitchArea.setAttribute("stroke", "darkslategray")
        polygonPitchArea.setAttribute("stroke-width", "1")
        polygonPitchArea.setAttribute("fill", "darkslategray")
        polygonPitchArea.setAttribute("opacity", "0.32")
        gDebug.append(polygonPitchArea)
        svgPolygonPitchArea = polygonPitchArea

        blks.forEach((blk) => {
          const blkFrontLeft = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle",
          )
          blkFrontLeft.setAttribute("id", `snl2svg-block-fl-${blk.id}`)
          blkFrontLeft.setAttribute("cx", `${blk.maqPoints[0].x}`)
          blkFrontLeft.setAttribute("cy", `${blk.maqPoints[0].y}`)
          blkFrontLeft.setAttribute("r", "1")
          blkFrontLeft.setAttribute("fill", "darkslategray")
          blkFrontLeft.setAttribute("opacity", "0.32")
          gDebug.append(blkFrontLeft)
          const blkMaqPolygon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polygon",
          )
          blkMaqPolygon.setAttribute("id", `snl2svg-block-maq-${blk.id}`)
          blkMaqPolygon.setAttribute(
            "points",
            `${blk.maqPoints[0].x},${blk.maqPoints[0].y} ${blk.maqPoints[1].x},${blk.maqPoints[1].y} ${blk.maqPoints[2].x},${blk.maqPoints[2].y} ${blk.maqPoints[3].x},${blk.maqPoints[3].y}`,
          )
          blkMaqPolygon.setAttribute("fill", "darkslategray")
          blkMaqPolygon.setAttribute("opacity", "0.32")
          gDebug.append(blkMaqPolygon)
        })

        /* For Debugging 
    blks.forEach((b) => {
      const frontLeftToRight = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      )
      frontLeftToRight.setAttribute("x1", `${b.maqPoints[0].x}`)
      frontLeftToRight.setAttribute("y1", `${b.maqPoints[0].y}`)
      frontLeftToRight.setAttribute("x2", `${b.maqPoints[1].x}`)
      frontLeftToRight.setAttribute("y2", `${b.maqPoints[1].y}`)
      frontLeftToRight.setAttribute("stroke", "darkblue")
      frontLeftToRight.setAttribute("stroke-opacity", "0.8")
      frontLeftToRight.setAttribute("stroke-width", "0.5")
      svgElm.appendChild(frontLeftToRight)
      const frontLeftToBack = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      )
      frontLeftToBack.setAttribute("x1", `${b.maqPoints[0].x}`)
      frontLeftToBack.setAttribute("y1", `${b.maqPoints[0].y}`)
      frontLeftToBack.setAttribute("x2", `${b.maqPoints[3].x}`)
      frontLeftToBack.setAttribute("y2", `${b.maqPoints[3].y}`)
      frontLeftToBack.setAttribute("stroke", "darkgreen")
      frontLeftToBack.setAttribute("stroke-opacity", "0.8")
      frontLeftToBack.setAttribute("stroke-width", "0.5")
      svgElm.appendChild(frontLeftToBack)
      const backLeftToRight = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      )
      backLeftToRight.setAttribute("x1", `${b.maqPoints[2].x}`)
      backLeftToRight.setAttribute("y1", `${b.maqPoints[2].y}`)
      backLeftToRight.setAttribute("x2", `${b.maqPoints[3].x}`)
      backLeftToRight.setAttribute("y2", `${b.maqPoints[3].y}`)
      backLeftToRight.setAttribute("stroke", "darkred")
      backLeftToRight.setAttribute("stroke-opacity", "0.8")
      backLeftToRight.setAttribute("stroke-width", "0.5")
      svgElm.appendChild(backLeftToRight)
      const frontRightToBack = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      )
      frontRightToBack.setAttribute("x1", `${b.maqPoints[1].x}`)
      frontRightToBack.setAttribute("y1", `${b.maqPoints[1].y}`)
      frontRightToBack.setAttribute("x2", `${b.maqPoints[2].x}`)
      frontRightToBack.setAttribute("y2", `${b.maqPoints[2].y}`)
      frontRightToBack.setAttribute("stroke", "darkmagenta")
      frontRightToBack.setAttribute("stroke-opacity", "0.8")
      frontRightToBack.setAttribute("stroke-width", "0.5")
      svgElm.appendChild(frontRightToBack)
      const frontLeftToCenter = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      )
      frontLeftToCenter.setAttribute(
        "x1",
        `${b.maqPoints[0].x + (b.maqPoints[1].x - b.maqPoints[0].x) * 0.5}`,
      )
      frontLeftToCenter.setAttribute(
        "y1",
        `${b.maqPoints[0].y + (b.maqPoints[1].y - b.maqPoints[0].y) * 0.5}`,
      )
      frontLeftToCenter.setAttribute(
        "x2",
        `${b.maqPoints[0].x + (b.maqPoints[1].x - b.maqPoints[0].x) * 0.5 + b.unitVectorToCenter.x * b.distToCenter}`,
      )
      frontLeftToCenter.setAttribute(
        "y2",
        `${b.maqPoints[0].y + (b.maqPoints[1].y - b.maqPoints[0].y) * 0.5 + b.unitVectorToCenter.y * b.distToCenter}`,
      )
      frontLeftToCenter.setAttribute("stroke", "black")
      frontLeftToCenter.setAttribute("stroke-opacity", "0.8")
      frontLeftToCenter.setAttribute("stroke-width", "0.5")
      svgElm.appendChild(frontLeftToCenter)
    })
    */
        /* For Debugging 
    blks.forEach((b) => {
      // Add Bounding of Block
      const polygon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polygon",
      )
      polygon.setAttribute(
        "points",
        `${b.obbPoints[0].x},${b.obbPoints[0].y} ${b.obbPoints[1].x},${b.obbPoints[1].y} ${b.obbPoints[2].x},${b.obbPoints[2].y} ${b.obbPoints[3].x},${b.obbPoints[3].y}`,
      )
      polygon.setAttribute("stroke", "black")
      polygon.setAttribute("stroke-opacity", "0.38")
      polygon.setAttribute("stroke-width", "0.1")
      polygon.setAttribute("fill", "none")
      svgElm.appendChild(polygon)
    })
*/
        /* For Debugging
        bl.forEach((b) => {
          // Add 2 Lines
          const frontLeftToRight = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line",
          )
          frontLeftToRight.setAttribute("x1", `${b.bounding[0].x}`)
          frontLeftToRight.setAttribute("y1", `${b.bounding[0].y}`)
          frontLeftToRight.setAttribute("x2", `${b.bounding[1].x}`)
          frontLeftToRight.setAttribute("y2", `${b.bounding[1].y}`)
          frontLeftToRight.setAttribute("stroke", "darkblue")
          frontLeftToRight.setAttribute("stroke-opacity", "0.8")
          frontLeftToRight.setAttribute("stroke-width", "0.5")
          svgElm.appendChild(frontLeftToRight)
          const frontLeftToBack = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line",
          )
          frontLeftToBack.setAttribute("x1", `${b.bounding[0].x}`)
          frontLeftToBack.setAttribute("y1", `${b.bounding[0].y}`)
          frontLeftToBack.setAttribute("x2", `${b.bounding[3].x}`)
          frontLeftToBack.setAttribute("y2", `${b.bounding[3].y}`)
          frontLeftToBack.setAttribute("stroke", "darkgreen")
          frontLeftToBack.setAttribute("stroke-opacity", "0.8")
          frontLeftToBack.setAttribute("stroke-width", "0.5")
          svgElm.appendChild(frontLeftToBack)
        })
  */

        svgElm.remove()
        svgElm.removeAttribute("style")
        svgElm.setAttribute("width", "100%")
        svgElm.setAttribute("height", "100%")
        if (svgContent) {
          for (const child of [...svgContent.children]) {
            child.remove()
          }
          svgCurrentViewBox.x = svgElm.viewBox.baseVal.x
          svgCurrentViewBox.y = svgElm.viewBox.baseVal.y
          svgCurrentViewBox.w = svgElm.viewBox.baseVal.width
          svgCurrentViewBox.h = svgElm.viewBox.baseVal.height

          svgContent.append(svgElm)
          svgElement = svgElm

          regenerateAllSeatCircles()

          svgElement.addEventListener("mouseleave", svgOnMouseleave)
          svgElement.addEventListener("mousedown", svgOnmousedown)
          svgElement.addEventListener("mousemove", svgOnMousemove)
          svgElement.addEventListener("wheel", svgOnWheel)

          blockList.forEach((block) => {
            block.element.addEventListener("click", (ev) => {
              if (
                ev.clientX === mousedownClientX &&
                ev.clientY === mousedownClientY
              ) {
                if (openBlockPopover) openBlockPopover(block)
              }
            })
          })
        }
        isSvgLoaded = true
      })
    }
  }

  function downloadSvg() {
    if (!svgElement) return
    const svgText = new XMLSerializer().serializeToString(svgElement)
    const svgBlob = new Blob([svgText], { type: "image/svg+xml" })
    const svgUrl = URL.createObjectURL(svgBlob)

    const a = document.createElement("a")
    a.href = svgUrl
    a.download = "venue_seats.svg"

    document.body.appendChild(a)
    a.click()

    document.body.removeChild(a)
    URL.revokeObjectURL(svgUrl)
  }

  async function saveSvgWithDialog() {
    if (!svgElement) return
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: `${svgFileName.get()?.split(".").slice(0, -1).join(".") ?? "venue"}_add_seats.svg`,
        types: [
          {
            description: "Svg Files",
            accept: { "image/svg+xml": [".svg"] },
          },
        ],
      })

      const svgText = new XMLSerializer().serializeToString(svgElement)
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml")
      const svgs = doc.getElementsByTagName("svg")

      if (svgs.length < 1) throw Error("Not found svg element.")

      console.debug("readed attributes: ", svgs[0].attributes)
      for (const attr of [...svgs[0].attributes]) {
        svgs[0].removeAttribute(attr.name)
      }

      console.debug("remove all attributes: ", svgs[0].attributes)

      for (const [name, value] of svgOriginalAttributes) {
        svgs[0].setAttribute(name, value)
      }

      console.debug("set all default attributes: ", svgs[0].attributes)

      for (const child of [...svgs[0].children]) {
        if (child instanceof SVGGElement) {
          if (
            ["seats", svgBlocksGroupId, "debug-text"].findIndex(
              (v) => v === child.id,
            ) === -1
          ) {
            child.remove()
          }
        } else {
          if (child.id.includes("snl2svg")) {
            child.remove()
          }
        }
      }
      const writable = await handle.createWritable()
      await writable.write(new XMLSerializer().serializeToString(svgs[0]))
      await writable.close()
    } catch (err) {
      console.log(err)
    }
  }

  function sendToBlockWorker(payload: {}) {
    console.debug("sendToBlockWorker:", payload)
    return new Promise<{
      pointsFromFrontLeftClockwise: { x: number; y: number }[]
      lengthFLtoFR: number
      lengthFLtoBL: number
      lengthBLtoBR: number
      unitVectorFLtoFR: { x: number; y: number }
      unitVectorFLtoBL: { x: number; y: number }
      distToCenter: number
      unitVectorToCenter: { x: number; y: number }
    }>((resolve) => {
      if (blockWorker) {
        const id = blockWorkerMessageId++
        blockWorkerPromises.set(id, resolve)
        blockWorker.postMessage(Object.assign({ id: id }, payload))
      }
    })
  }

  onMount(() => {
    seatNoListFileName.set(undefined)
    svgFileName.set(undefined)

    // Init Seat No List Web Worker
    snlWorker = new Worker(
      new URL("../workers/snl-worker.ts", import.meta.url),
      { type: "module" },
    )
    snlWorker.onmessage = (event: MessageEvent) => {
      seatNoList = event.data.seatNoList
      consecutiveSeatsList = event.data.consecutiveSeatsList
      sectionList = event.data.sectionList
      isLoadingXlsx = false
      assignBlockToSection()
      regenerateAllSeatCircles()
    }
    snlWorker.onerror = function (error) {
      isLoadingXlsx = false
      isInvalidFileXlsx = true
      console.error(error)
    }

    // Init SVG Web Worker
    svgWorker = new Worker(
      new URL("../workers/svg-worker.ts", import.meta.url),
      { type: "module" },
    )
    svgWorker.onmessage = (event: MessageEvent) => {
      try {
        createSvgElement(event.data.text)
      } catch (er) {
        isInvalidFileSvg = true
      } finally {
        isLoadingSvg = false
      }
    }
    svgWorker.onerror = function (error) {
      isLoadingSvg = false
      isInvalidFileSvg = true
      console.error(error)
    }

    blockWorker = new Worker(
      new URL("../workers/block-worker.ts", import.meta.url),
      { type: "module" },
    )
    blockWorker.onmessage = (event: MessageEvent) => {
      const { id, result } = event.data

      if (blockWorkerPromises.has(id)) {
        const resolve = blockWorkerPromises.get(id)
        resolve(result)
        blockWorkerPromises.delete(id)
      }
    }
    blockWorker.onerror = function (error) {
      console.error(error)
    }

    window.addEventListener("mouseup", draggingFlgOff)
  })

  onDestroy(() => {
    if (snlWorker) snlWorker.terminate()
    if (svgWorker) svgWorker.terminate()
    if (blockWorker) blockWorker.terminate()
    window.removeEventListener("mouseup", draggingFlgOff)
  })

  $effect(() => {
    console.debug("Excel file changed: ", filesXlsx)
    isInvalidFileXlsx = false
    if (!filesXlsx) return
    if (snlWorker) {
      isLoadingXlsx = true
      snlWorker.postMessage(filesXlsx[0])
      seatNoListFileName.set(filesXlsx[0].name)
    }
  })

  $effect(() => {
    console.debug("SVG file changed: ", filesSvg)
    isInvalidFileSvg = false
    if (!filesSvg) return
    if (svgWorker) {
      isLoadingSvg = true
      svgWorker.postMessage(filesSvg[0])
      svgFileName.set(filesSvg[0].name)
    }
  })

  $effect(() => {
    if ($debugTextVisibility) {
      if (svgDebugTextGroupElement) {
        svgElement?.appendChild(svgDebugTextGroupElement)
      }
    } else {
      svgDebugTextGroupElement?.remove()
    }
    console.debug("Debug Text Visibility changed: ", debugTextVisibility.get())
  })

  $effect(() => {
    pitchAreaPoints.splice(0)
    pitchAreaPoints.push(
      {
        x:
          svgOriginalViewBox.x +
          svgOriginalViewBox.width * ($pitchArea.widthMinPct / 100),
        y:
          svgOriginalViewBox.y +
          svgOriginalViewBox.height * ($pitchArea.heightMinPct / 100),
      },
      {
        x:
          svgOriginalViewBox.x +
          svgOriginalViewBox.width * ($pitchArea.widthMaxPct / 100),
        y:
          svgOriginalViewBox.y +
          svgOriginalViewBox.height * ($pitchArea.heightMinPct / 100),
      },
      {
        x:
          svgOriginalViewBox.x +
          svgOriginalViewBox.width * ($pitchArea.widthMaxPct / 100),
        y:
          svgOriginalViewBox.y +
          svgOriginalViewBox.height * ($pitchArea.heightMaxPct / 100),
      },
      {
        x:
          svgOriginalViewBox.x +
          svgOriginalViewBox.width * ($pitchArea.widthMinPct / 100),
        y:
          svgOriginalViewBox.y +
          svgOriginalViewBox.height * ($pitchArea.heightMaxPct / 100),
      },
    )
    if (svgPolygonPitchArea) {
      svgPolygonPitchArea.setAttribute(
        "points",
        `${pitchAreaPoints[0].x},${pitchAreaPoints[0].y} ${pitchAreaPoints[1].x},${pitchAreaPoints[1].y} ${pitchAreaPoints[2].x},${pitchAreaPoints[2].y} ${pitchAreaPoints[3].x},${pitchAreaPoints[3].y}`,
      )
    }
    console.debug("set polygon points:", pitchAreaPoints)
  })

  async function updateBlocks(blks: Block[]) {
    for (let i = 0; i < blks.length - 1; i++) {
      let blk = blks[i]
      const ret = await getNewBlockDirecton(blk)
      if (blk.maqPoints.every((val, index) => val.x === ret.maqPoints[index].x && val.y === ret.maqPoints[index].y)) {
        console.debug("not update block svg:", ret)
      } else {
        console.debug("update block svg:", ret)
        blk = ret
        const blkfl = svgElement.getElementById(`snl2svg-block-fl-${blk.id}`)
        if (blkfl) {
          blkfl.setAttribute("cx", `${blk.maqPoints[0].x}`)
          blkfl.setAttribute("cy", `${blk.maqPoints[0].y}`)
        }
        const blkmaq = svgElement.getElementById(`snl2svg-block-maq-${blk.id}`)
        if (blkmaq) {
          blkmaq.setAttribute(
            "points",
            `${blk.maqPoints[0].x},${blk.maqPoints[0].y} ${blk.maqPoints[1].x},${blk.maqPoints[1].y} ${blk.maqPoints[2].x},${blk.maqPoints[2].y} ${blk.maqPoints[3].x},${blk.maqPoints[3].y}`,
          )
        }
      }
    }
  }

  $effect(() => {
    if (venue.isShowPitchArea) {
      beforeChangePitchAreaValue = pitchAreaPoints.slice()
      toggleVisibilityPitchArea(true)
    } else {
      if (
        beforeChangePitchAreaValue.length === 0 ||
        (beforeChangePitchAreaValue.length === pitchAreaPoints.length &&
          beforeChangePitchAreaValue.every(
            (val, index) => val === pitchAreaPoints[index],
          ))
      ) {
        console.debug("Not updated pitch area.")
        toggleVisibilityPitchArea(false)
      } else {
        console.debug("Pitch area is updated.")
        const promises = [updateBlocks(blockList)]
        Promise.all(promises).finally(() => 
          toggleVisibilityPitchArea(false)
        )
      }
    }
  })
</script>

<div class="p-2 m-2 flex-none bg-base-100">
  <fieldset class="fieldset">
    <legend class="fieldset-legend">Default Settings</legend>
    <label for="seat-gap" class="label text-base-content/88 mt-2"
      >Mimimum Gap</label
    >
    <input
      id="seat-gap"
      type="number"
      class="input input-sm w-32"
      placeholder="0.05"
      min="0"
      bind:value={$seatGap}
    />
    <!--
    <label for="seat-circle-radius" class="label text-base-content/88 mt-2"
      >Seat Circle Radius</label
    >
    <input
      id="seat-circle-radius"
      type="number"
      class="input input-sm w-32"
      placeholder="0.5"
      min="0"
      bind:value={$seatCircleRadius}
    />
    -->
    <label for="margin-front" class="label text-base-content/88 mt-2"
      >Margin Front</label
    >
    <input
      id="margin-front"
      type="number"
      class="input input-sm w-32"
      placeholder="0.5"
      min="0"
      bind:value={$marginFront}
    />
    <label for="margin-right" class="label text-base-content/88 mt-2"
      >Margin Right</label
    >
    <input
      id="margin-right"
      type="number"
      class="input input-sm w-32"
      placeholder="0.5"
      min="0"
      bind:value={$marginRight}
    />
    <label for="margin-back" class="label text-base-content/88 mt-2"
      >Margin Back</label
    >
    <input
      id="margin-back"
      type="number"
      class="input input-sm w-32"
      placeholder="0.5"
      min="0"
      bind:value={$marginBack}
    />
    <label for="margin-left" class="label text-base-content/88 mt-2"
      >Margin Left</label
    >
    <input
      id="margin-left"
      type="number"
      class="input input-sm w-32"
      placeholder="0.5"
      min="0"
      bind:value={$marginLeft}
    />
    <label for="seat-align" class="label text-base-content/88 mt-2"
      >Seat Align</label
    >
    <select
      id="seat-align"
      class="select select-sm w-32"
      bind:value={$seatAlign}
    >
      <option value="left">Left</option>
      <option value="center">Center</option>
      <option value="right">Right</option>
    </select>
    <label for="numeric-precision" class="label text-base-content/88 mt-2"
      >Precision</label
    >
    <input
      id="numeric-precision"
      type="number"
      class="input input-sm w-32"
      placeholder="2"
      min="0"
      bind:value={$numericPrecision}
    />
    <label for="font-size" class="label text-base-content/88 mt-2"
      >Font Size</label
    >
    <input
      id="font-size"
      type="number"
      class="input input-sm w-32"
      placeholder="2"
      min="0"
      bind:value={$debugTextFontSize}
    />
    <button
      class="btn btn-outline mt-4"
      onclick={async () => {
        try {
          isGeneratingSeatCircles = true
          await tick()
          regenerateAllSeatCircles()
        } finally {
          isGeneratingSeatCircles = false
        }
      }}
    >
      {#if isGeneratingSeatCircles}
        <span class="loading loading-spinner text-info"></span>
      {:else}
        <span class="icon-[ic--baseline-refresh] text-lg"></span>
      {/if}
      Regenerate</button
    >
    <label class="label mt-4">
      <input
        type="checkbox"
        bind:checked={$debugTextVisibility}
        class="toggle"
      />
      Seat Number Text</label
    >
  </fieldset>
</div>
<div class="p-2 my-2 flex-none bg-base-100">
  <fieldset class="fieldset">
    <legend class="fieldset-legend">Seat number list</legend>
    <div class="relative flex items-center">
      <input
        type="file"
        bind:files={filesXlsx}
        accept=".xlsx"
        class={["file-input", "w-md", { "input-error": isInvalidFileXlsx }]}
        disabled={isLoadingXlsx}
      />
    </div>
    {#if isLoadingXlsx}
      <p class="label">
        <span class="loading loading-spinner text-info"></span>Loading...
      </p>
    {/if}
    {#if isInvalidFileXlsx}
      <p class="label text-error">
        <span class="icon-[material-symbols--error-outline]"></span>Invalid
        file!
      </p>
    {/if}
  </fieldset>
  {#if 0 < blockList.length}
    <div class="py-2 my-2">
      <div class="py-2 flex justify-between">
        <h6 class="text-xs font-medium">Block list</h6>
      </div>
      <BlockTable
        bind:data={blockList}
        refreshSeat={regenerateBlocksSeatCircles}
        bind:openPopover={openBlockPopover}
      ></BlockTable>
    </div>
  {/if}
  {#if 0 < sectionList.length}
    <div class="py-2 my-2">
      <div class="py-2 flex justify-between">
        <h6 class="text-xs font-medium">Section list</h6>
      </div>
      <SectionTable bind:data={sectionList}></SectionTable>
    </div>
  {/if}
  {#if 0 < consecutiveSeatsList.length}
    <div class="py-2 my-2">
      <div class="py-2 flex justify-between">
        <h6 class="text-xs font-medium">Consecutive seats list</h6>
      </div>
      <ConsecutiveSeatsTable bind:data={consecutiveSeatsList}
      ></ConsecutiveSeatsTable>
    </div>
  {/if}
  {#if 0 < seatNoList.length}
    <div class="py-2 my-2">
      <div class="py-2 flex justify-between">
        <h6 class="text-xs font-medium">Seat list</h6>
      </div>
      <SeatNoTable bind:data={seatNoList}></SeatNoTable>
    </div>
  {/if}
</div>
<div class="p-2 m-2 grow bg-base-100">
  <fieldset class="fieldset">
    <legend class="fieldset-legend">Venue SVG</legend>
    <div class="relative flex items-center">
      <input
        type="file"
        bind:files={filesSvg}
        accept=".svg"
        class={["file-input", "w-md", { "input-error": isInvalidFileSvg }]}
        disabled={isLoadingSvg}
      />
    </div>
    {#if isLoadingSvg}
      <p class="label">
        <span class="loading loading-spinner text-info"></span>Loading...
      </p>
    {/if}
    {#if isInvalidFileSvg}
      <p class="label text-error">
        <span class="icon-[material-symbols--error-outline]"></span>Invalid
        file!
      </p>
    {/if}
  </fieldset>
  <div class="py-2 my-2 w-full">
    <div class="card bg-base-300">
      <div class="card-body p-0" bind:this={svgContent}></div>
    </div>
  </div>
  <div class="py-2 my-2 w-full flex justify-end">
    <button
      class="btn btn-outline mt-4"
      disabled={isInvalidFileSvg || isLoadingSvg || !isSvgLoaded}
      onclick={saveSvgWithDialog}
      ><span class="icon-[mdi--file-export-outline] text-lg"></span>Export SVG</button
    >
  </div>
</div>
<div class="toast toast-center z-100">
  {#if alertMessage}
    <div role="alert" class="alert alert-warning">
      <span class="text-lg icon-[mdi--alert-outline]"></span>
      <p class="text-wrap whitespace-pre-line font-bold">{alertMessage}</p>
      <button
        class="btn btn-sm btn-circle btn-warning"
        onclick={() => {
          alertMessage = ""
        }}>✕</button
      >
    </div>
  {/if}
</div>
