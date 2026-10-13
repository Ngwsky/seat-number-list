<script lang="ts">
  import { onMount, onDestroy } from "svelte"
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
  import { svgHoverPoint } from "../stores/store"
  import {
    seatNoListFileName,
    svgFileName,
    numericPrecision,
    seatGap,
    seatCircleRadius,
    marginLeft,
    marginRight,
    marginFront,
    marginBack,
  } from "../stores/settings"

  let alertMessage = $state("")
  let filesXlsx = $state<FileList>()
  let filesSvg = $state<FileList>()
  let isLoadingXlsx = $state<boolean>(false)
  let isLoadingSvg = $state<boolean>(false)
  let isInvalidFileXlsx = $state(false)
  let isInvalidFileSvg = $state(false)
  let svgContent = $state<Element>()
  let seatNoList: Array<SeatNo> = $state([])
  let consecutiveSeatsList: Array<ConsecutiveSeats> = $state([])
  let sectionList: Array<Section> = $state([])
  let blockList: Array<Block> = $state([])
  let snlWorker: Worker | null = null
  let svgWorker: Worker | null = null
  let svgElement: SVGSVGElement
  let svgSeatsGroupElement: SVGGElement
  let viewBox = { x: 0, y: 0, w: 300, h: 300 }
  let isDragging = false
  let startX = 0
  let startY = 0

  function getMinimumBoundingRect(points: Array<DOMPoint>) {
    if (points.length < 3) return [...points]

    let minArea = Infinity
    let minRect = null

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i]
      const p2 = points[(i + 1) % points.length]

      const angleRad = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      const cosRot = Math.cos(-angleRad)
      const sinRot = Math.sin(-angleRad)

      let minX = Infinity,
        maxX = -Infinity
      let minY = Infinity,
        maxY = -Infinity

      points.forEach((p) => {
        const rotatedPoint = {
          x: p.x * cosRot - p.y * sinRot,
          y: p.x * sinRot + p.y * cosRot,
        }
        if (rotatedPoint.x < minX) minX = rotatedPoint.x
        if (rotatedPoint.x > maxX) maxX = rotatedPoint.x
        if (rotatedPoint.y < minY) minY = rotatedPoint.y
        if (rotatedPoint.y > maxY) maxY = rotatedPoint.y
      })

      const width = maxX - minX
      const height = maxY - minY
      const area = width * height

      if (area < minArea) {
        minArea = area
        minRect = {
          x: minX,
          y: minY,
          width: width,
          height: height,
          angleRad: angleRad,
        }
      }
    }

    if (!minRect) return []

    const rectPoints = [
      { x: minRect.x, y: minRect.y },
      { x: minRect.x + minRect.width, y: minRect.y },
      { x: minRect.x + minRect.width, y: minRect.y + minRect.height },
      { x: minRect.x, y: minRect.y + minRect.height },
    ]
    const cosRev = Math.cos(minRect.angleRad)
    const sinRev = Math.sin(minRect.angleRad)
    const result = rectPoints.map((p) => {
      return new DOMPoint(
        p.x * cosRev - p.y * sinRev,
        p.x * sinRev + p.y * cosRev,
      )
    })
    /* for debugging
    const cxRot = minRect.x + minRect.width / 2
    const cyRot = minRect.y + minRect.height / 2
    const cx = cxRot * cosRev - cyRot * sinRev
    const cy = cxRot * sinRev + cyRot * cosRev
    console.log("center = { " + cx.toFixed(2) + "," + cy.toFixed(2) + "}, point = {" + ((result[0].x + result[2].x)/2).toFixed(2) + "," + ((result[0].y + result[2].y)/2).toFixed(2) + "})
    */
    return result
  }

  function draggingFlgOff() {
    isDragging = false
  }

  function createSeatCircles(blocks: Array<Block>) {
    if (!svgElement) return
    const seatsElement = svgElement.getElementById("seats")
    if (seatsElement) svgElement.removeChild(seatsElement)
    const errorGroupList = []
    const errorGroupNameList: Array<string> = []
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g")
    group.setAttribute("id", "seats")
    blocks.forEach(b => {
      if (b.sections.length < 1) return
      let minFirstRow = Infinity
      let maxLastRow = 0
      let minLeftX = Infinity
      let maxRightX = 0
      b.sections.forEach(s => {
        if (s.firstRow < minFirstRow) minFirstRow = s.firstRow
        if (maxLastRow < s.lastRow) maxLastRow = s.lastRow
        if (s.minSeatX < minLeftX) minLeftX = s.minSeatX
        if (maxRightX < s.maxSeatX) maxRightX = s.maxSeatX
      })
      const rowCnt = maxLastRow - minFirstRow + 1
      const colCnt = maxRightX - minLeftX + 1
      const ml = b.marginLeft ?? marginLeft.get()
      const mr = b.marginRight ?? marginRight.get()
      const mf = b.marginFront ?? marginFront.get()
      const mb = b.marginBack ?? marginBack.get()
      const gap = b.seatGap ?? seatGap.get()
      const innerWidth = b.width - mr - ml
      const stepSeat = innerWidth / colCnt
      const innerHeight = b.height - mf - mb
      const stepRow = innerHeight / rowCnt
      const radius =  stepSeat < stepRow ? (stepSeat - (gap / 2)) / 2 : (stepRow - (gap / 2)) / 2
      if (radius <= 0) {
        errorGroupList.push(b)
        errorGroupNameList.push(b.element.getAttribute("data-name") ?? b.element.getAttribute("id") ?? "")
        return
      }
      const adjustSeat = gap / 4 + (stepRow < stepSeat ? (stepSeat - stepRow) / 2 : 0)
      const adjustRow = gap / 4 + (stepSeat < stepRow ? (stepRow - stepSeat) / 2 : 0)
      const innerWidthX = (b.bounding[1].x - b.bounding[0].x) - b.unitVectorP0toP1.x * (ml + mr)
      const innerWidthY = (b.bounding[1].y - b.bounding[0].y) - b.unitVectorP0toP1.y * (ml + mr)
      const innerHeightX = (b.bounding[3].x - b.bounding[0].x) - b.unitVectorP0toP3.x * (mf + mb)
      const innerHeightY = (b.bounding[3].y - b.bounding[0].y) - b.unitVectorP0toP3.y * (mf + mb)
      const stepSeatX = innerWidthX / colCnt
      const stepSeatY = innerWidthY / colCnt
      const stepRowX = innerHeightX / rowCnt
      const stepRowY = innerHeightY / rowCnt
      let startX = b.bounding[0].x + b.unitVectorP0toP1.x * (ml + radius + adjustSeat) + b.unitVectorP0toP3.x * (mf + radius + adjustRow)
      let startY = b.bounding[0].y + b.unitVectorP0toP1.y * (ml + radius + adjustSeat) + b.unitVectorP0toP3.y * (mf + radius + adjustRow)
      b.sections.forEach(sct => {
        sct.consecutiveSeatsLists.forEach(css => {
          css.forEach(cs => {
            cs.seatNoList.forEach(sn => {
              const cx = startX + (sn.row - minFirstRow) * stepRowX + (sn.seatIndex + sn.colOffset - minLeftX) * stepSeatX
              const cy = startY + (sn.row - minFirstRow) * stepRowY + (sn.seatIndex + sn.colOffset - minLeftX) * stepSeatY
              const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
              circle.setAttribute("id", sn.area + ':' + sn.block + ':' + sn.row + ':' + sn.seatIndex)
              circle.setAttribute("data-name", sn.area + ':' + sn.block + ':' + sn.row + ':' + sn.seatIndex)
              circle.setAttribute("cx", cx.toFixed(numericPrecision.get()))
              circle.setAttribute("cy", cy.toFixed(numericPrecision.get()))
              circle.setAttribute("r", radius.toFixed(numericPrecision.get()))
              group.appendChild(circle)
            })
          })
        })
      })
    })
    svgSeatsGroupElement = group
    svgElement.appendChild(group)
    if (0 < errorGroupList.length) {
      alertMessage = `${errorGroupList.length} ブロックの Seat Gap が大きすぎるため、座席を作成できませんでした。
        ${errorGroupNameList.join(", ")}`
    }
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
          if (b.element.id.endsWith(blockName)) return true
          return false
        })
        if (bls.length === 1) {
          s.blockElement = bls[0]
          bls[0].sections.push(s)
        } else if (1 < bls.length) {
          const notAssing = bls.find(b => {
            return b.sections.length === 0
          })
          if (notAssing) {
            s.blockElement = notAssing
            notAssing.sections.push(s)
          } else {
            s.blockOptions = bls
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
    svgHoverPoint.setKey("x", undefined)
    svgHoverPoint.setKey("y", undefined)
  }

  function svgOnmousedown(ev: MouseEvent) {
    isDragging = true
    startX = ev.clientX
    startY = ev.clientY
  }

  function svgOnMousemove(ev: MouseEvent) {
    if (isDragging) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const scaleX = viewBox.w / svgElement.clientWidth
      const scaleY = viewBox.h / svgElement.clientHeight
      viewBox.x -= dx * scaleX
      viewBox.y -= dy * scaleY
      startX = ev.clientX
      startY = ev.clientY
      svgElement.setAttribute(
        "viewBox",
        `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`,
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
      svgHoverPoint.setKey("x", svgX)
      svgHoverPoint.setKey("y", svgY)
    }
  }

  function svgOnWheel(ev: WheelEvent) {
    ev.preventDefault()
    const rect = svgElement.getBoundingClientRect()
    const clientX = ev.clientX - rect.left
    const clientY = ev.clientY - rect.top
    const zoomFactor = ev.deltaY < 0 ? 0.9 : 1.1
    const dw = viewBox.w * (1 - zoomFactor)
    const dh = viewBox.h * (1 - zoomFactor)
    viewBox.x += (clientX / rect.width) * dw
    viewBox.y += (clientY / rect.height) * dh
    viewBox.w *= zoomFactor
    viewBox.h *= zoomFactor
    svgElement.setAttribute(
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`,
    )
  }

  onMount(() => {
    // TODO: Restore the previous state. now clear stores.
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
      createSeatCircles(blockList)
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
        const text = event.data.text
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, "image/svg+xml")
        const svgs = doc.getElementsByTagName("svg")
        const bl: Array<Block> = []

        if (svgs.length === 0) {
          isInvalidFileSvg = true
          isLoadingSvg = false
          return
        }

        const svgElm = svgs[0]
        const centerOfViewBox = {
          x:
            svgElm.viewBox.baseVal.x +
            (svgElm.viewBox.baseVal.width - svgElm.viewBox.baseVal.x) / 2,
          y:
            svgElm.viewBox.baseVal.y +
            (svgElm.viewBox.baseVal.height - svgElm.viewBox.baseVal.y) / 2,
        }
        const blocks = svgElm.getElementById("blocks")

        if (blocks) {
          const allDescendants = blocks.querySelectorAll("*")

          allDescendants.forEach((child) => {
            if (
              child instanceof SVGRectElement ||
              child instanceof SVGPolygonElement
            ) {
              const points: Array<DOMPoint> = []
              if (child instanceof SVGRectElement) {
                points.push(
                  new DOMPoint(child.x.baseVal.value, child.y.baseVal.value),
                )
                points.push(
                  new DOMPoint(
                    child.x.baseVal.value + child.width.baseVal.value,
                    child.y.baseVal.value,
                  ),
                )
                points.push(
                  new DOMPoint(
                    child.x.baseVal.value + child.width.baseVal.value,
                    child.y.baseVal.value + child.height.baseVal.value,
                  ),
                )
                points.push(
                  new DOMPoint(
                    child.x.baseVal.value,
                    child.y.baseVal.value + child.height.baseVal.value,
                  ),
                )
              } else {
                for (const p of child.points) {
                  points.push(new DOMPoint(p.x, p.y))
                }
              }

              const ctm = child.getCTM()

              if (ctm) {
                points.forEach((p) => (p = p.matrixTransform(ctm)))
              }

              const axisAlignedBoundingBoxPoints =
                getMinimumBoundingRect(points)

              if (axisAlignedBoundingBoxPoints.length < 4) return

              // 最小外接矩形の中央から SVG 座標の中央へのベクトル
              const centerOfRect = {
                x:
                  (axisAlignedBoundingBoxPoints[0].x +
                    axisAlignedBoundingBoxPoints[2].x) /
                  2,
                y:
                  (axisAlignedBoundingBoxPoints[0].y +
                    axisAlignedBoundingBoxPoints[2].y) /
                  2,
              }
              const vecRectToCenter = {
                x: centerOfViewBox.x - centerOfRect.x,
                y: centerOfViewBox.y - centerOfRect.y,
              }
              const vecRectToCenterLength = Math.hypot(
                vecRectToCenter.x,
                vecRectToCenter.y,
              )
              const vecRectToCenterNormalized = {
                x: vecRectToCenter.x / vecRectToCenterLength,
                y: vecRectToCenter.y / vecRectToCenterLength,
              }
              // 最小外接矩形の１点目から２点目へのベクトル
              const vec0to1 = {
                x:
                  axisAlignedBoundingBoxPoints[1].x -
                  axisAlignedBoundingBoxPoints[0].x,
                y:
                  axisAlignedBoundingBoxPoints[1].y -
                  axisAlignedBoundingBoxPoints[0].y,
              }
              const vec0to1Length = Math.hypot(vec0to1.x, vec0to1.y)
              const vec0to1Normalized = {
                x: vec0to1.x / vec0to1Length,
                y: vec0to1.y / vec0to1Length,
              }
              // 最小外接矩形の１点目から４点目へのベクトル
              const vec0to3 = {
                x:
                  axisAlignedBoundingBoxPoints[3].x -
                  axisAlignedBoundingBoxPoints[0].x,
                y:
                  axisAlignedBoundingBoxPoints[3].y -
                  axisAlignedBoundingBoxPoints[0].y,
              }
              const vec0to3Length = Math.hypot(vec0to3.x, vec0to3.y)
              const vec0to3Normalized = {
                x: vec0to3.x / vec0to3Length,
                y: vec0to3.y / vec0to3Length,
              }
              // 最小外接矩形⇒中央と、最小外接矩形の始点からの２辺について内積を算出
              const dot0to1 =
                vecRectToCenterNormalized.x * vec0to1Normalized.x +
                vecRectToCenterNormalized.y * vec0to1Normalized.y
              const dot0to3 =
                vecRectToCenterNormalized.x * vec0to3Normalized.x +
                vecRectToCenterNormalized.y * vec0to3Normalized.y

              let w = vec0to1Length
              let h = vec0to3Length
              let uvec0to1 = vec0to1Normalized
              let uvec0to3 = vec0to3Normalized
              
              // 内積の絶対値が大きい方の辺を列方向とする
              if (Math.abs(dot0to1) < Math.abs(dot0to3)) {
                // プラスなら向きが同じ、マイナスなら逆向き
                if (0 < dot0to3) {
                  // ３点目が Front Row Leftmost
                  for (let i = 0; i < 2; i++) {
                    const fe = axisAlignedBoundingBoxPoints.shift()
                    if (fe) axisAlignedBoundingBoxPoints.push(fe)
                  }
                  uvec0to1 = {x: vec0to1Normalized.x * -1, y: vec0to1Normalized.y * -1}
                  uvec0to3 = {x: vec0to3Normalized.x * -1, y: vec0to3Normalized.y * -1}
                } else {
                  // １点目が Front Row Leftmost ⇒ なにもしない
                }
              } else {
                w = vec0to3Length
                h = vec0to1Length
                if (0 < dot0to1) {
                  // ２点目が Front Row Leftmost
                  const fe = axisAlignedBoundingBoxPoints.shift()
                  if (fe) axisAlignedBoundingBoxPoints.push(fe)
                  uvec0to1 = vec0to3Normalized
                  uvec0to3 = {x: vec0to1Normalized.x * -1, y: vec0to1Normalized.y * -1}
                } else {
                  // ４点目が Front Row Leftmost
                  for (let i = 0; i < 3; i++) {
                    const fe = axisAlignedBoundingBoxPoints.shift()
                    if (fe) axisAlignedBoundingBoxPoints.push(fe)
                  }
                  uvec0to1 = {x: vec0to3Normalized.x * -1, y: vec0to3Normalized.y * -1}
                  uvec0to3 = vec0to1Normalized
                }
              }

              bl.push({
                element: child,
                points: points,
                sections: [],
                bounding: axisAlignedBoundingBoxPoints,
                width: w,
                height: h,
                unitVectorP0toP1: uvec0to1,
                unitVectorP0toP3: uvec0to3,
                distToCenter: vecRectToCenterLength,
                unitVectorToCenter: vecRectToCenterNormalized,
              })
            }
          })

          bl.sort((a, b) => {
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
        }
        blockList = bl
        assignBlockToSection()

        const polygonViewBox = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon",
        )
        viewBox.x = svgElm.viewBox.baseVal.x
        viewBox.y = svgElm.viewBox.baseVal.y
        viewBox.w = svgElm.viewBox.baseVal.width
        viewBox.h = svgElm.viewBox.baseVal.height
        polygonViewBox.setAttribute(
          "points",
          `${viewBox.x},${viewBox.y} ${viewBox.x + viewBox.w},${viewBox.y} ${viewBox.x + viewBox.w},${viewBox.y + viewBox.h} ${viewBox.x},${viewBox.y + viewBox.h}`,
        )
        polygonViewBox.setAttribute("stroke", "none")
        polygonViewBox.setAttribute("stroke-width", "1")
        polygonViewBox.setAttribute("fill", "white")
        svgElm.prepend(polygonViewBox)


        /* For Debugging
        bl.forEach((b) => {
          // Add Bounding of Block
          const polygon = document.createElementNS("http://www.w3.org/2000/svg","polygon")
          polygon.setAttribute("points",
            `${b.bounding[0].x},${b.bounding[0].y} ${b.bounding[1].x},${b.bounding[1].y} ${b.bounding[2].x},${b.bounding[2].y} ${b.bounding[3].x},${b.bounding[3].y}`
          )
          polygon.setAttribute("stroke", "black")
          polygon.setAttribute("stroke-opacity", "0.38")
          polygon.setAttribute("stroke-width", "0.1")
          polygon.setAttribute("fill", "none")
          svgElm.appendChild(polygon)
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

        svgElm.setAttribute("id", "venue_svg")
        svgElm.setAttribute("width", "100%")
        svgElm.setAttribute("height", "auto")

        if (svgElement) svgContent?.removeChild(svgElement)

        svgContent?.append(svgElm)

        const elm = document.getElementById("venue_svg")

        if (elm && elm instanceof SVGSVGElement) {
          svgElement = elm
          svgElement.addEventListener("mouseleave", svgOnMouseleave)
          svgElement.addEventListener("mousedown", svgOnmousedown)
          svgElement.addEventListener("mousemove", svgOnMousemove)
          svgElement.addEventListener("wheel", svgOnWheel)
          createSeatCircles(blockList)
        }
      } finally {
        isLoadingSvg = false
      }
    }
    svgWorker.onerror = function (error) {
      isLoadingSvg = false
      isInvalidFileSvg = true
      console.error(error)
    }

    window.addEventListener("mouseup", draggingFlgOff)
  })

  onDestroy(() => {
    if (snlWorker) snlWorker.terminate()
    if (svgWorker) svgWorker.terminate()
    window.removeEventListener("mouseup", draggingFlgOff)
  })

  $effect(() => {
    isInvalidFileXlsx = false
    if (!filesXlsx) return
    if (snlWorker) {
      isLoadingXlsx = true
      snlWorker.postMessage(filesXlsx[0])
      seatNoListFileName.set(filesXlsx[0].name)
    }
  })

  $effect(() => {
    isInvalidFileSvg = false
    if (!filesSvg) return
    if (svgWorker) {
      isLoadingSvg = true
      svgWorker.postMessage(filesSvg[0])
      svgFileName.set(filesSvg[0].name)
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
    <button class="btn mt-4" onclick={() => {createSeatCircles(blockList)}}>Regenerate</button>
  </fieldset>
</div>
<div class="p-2 m-2 flex-none bg-base-100">
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
      <BlockTable bind:data={blockList}></BlockTable>
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
