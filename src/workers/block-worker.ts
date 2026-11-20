import {
  getCrossProductFrom3Points,
  getLineIntersection,
} from "../utils/geometry"

self.onmessage = (event: MessageEvent) => {
  const { id, points, pitchAreaPoints } = event.data
  self.postMessage({
    id: id,
    result: getPointsStartFromFrontLeftClockwise(points, pitchAreaPoints),
  })
}

/**
 * ブロックの四角形とピッチ方向から前列左側を始点とした時計回り順に並び替えて頂点リストを返却します
 * @param points - 四角形の頂点リスト
 * @param pitchArea - ピッチエリアの頂点リスト
 * @returns 
 */
function getPointsStartFromFrontLeftClockwise(
  points: { x: number; y: number }[],
  pitchAreaPoints: { x: number; y: number }[],
):{
    pointsFromFrontLeftClockwise: {x:number, y:number}[],
    lengthFLtoFR: number,
    lengthFLtoBL: number,
    lengthBLtoBR: number,
    unitVectorFLtoFR: { x: number, y: number },
    unitVectorFLtoBL: { x: number, y: number },
    distToCenter: number,
    unitVectorToCenter: {x:number, y:number},
  } {
  if (points.length !== 4) {
    throw Error("points not have 4 points.")
  }
  const pointsCw = points.slice(0)
  // 時計回りではない場合は時計回りに変更
  const cp = getCrossProductFrom3Points(points[1], points[0], points[2])
  if (0 < cp) {
    pointsCw.reverse()
  }

  // ４線のベクトルを算出
  const lines = []
  for (let i = 0; i < pointsCw.length; i++) {
    const j = (i + 1) % pointsCw.length
    const x = pointsCw[j].x - pointsCw[i].x
    const y = pointsCw[j].y - pointsCw[i].y
    const len = Math.hypot(x, y)
    const uvx = x / len
    const uvy = y / len
    lines.push({
      length: len,
      unitVector: { x: uvx, y: uvy },
      normalVector: { x: uvy, y: -uvx },
      midPoint: {
        x: pointsCw[i].x + uvx * len * 0.5,
        y: pointsCw[i].y + uvy * len * 0.5,
      },
    })
  }

  // 図形の各線中点からの法線上とピッチエリアの４線の交点が最も近い線を最前列とする
  let minLen = Infinity
  let minVecIndex = -1
  lines.forEach((line, index) => {
    for (let i = 0; i < pitchAreaPoints.length; i++) {
      const li = getLineIntersection(
        line.midPoint,
        {
          x: line.midPoint.x + line.normalVector.x,
          y: line.midPoint.y + line.normalVector.y,
        },
        pitchAreaPoints[i],
        pitchAreaPoints[(i + 1) % pitchAreaPoints.length],
      )
      if (li && 0 <= li.u1 && 0 <= li.u2 && li.u2 <= 1 && li.u1 < minLen) {
        minLen = li.u1
        minVecIndex = index
      }
    }
  })

  // どの法線もピッチエリアに交差しない場合
  let minLenPerDot = Infinity
  if (minVecIndex < 0) {
    // ピッチエリアからの距離が近く、法線とピッチエリア頂点へのベクトルが近いものを最前列とする
    lines.forEach((line, index) => {
      for (let i = 0; i < pitchAreaPoints.length; i++) {
        const toPx = pitchAreaPoints[i].x - line.midPoint.x
        const toPy = pitchAreaPoints[i].y - line.midPoint.y
        const dot = line.normalVector.x * toPx + line.normalVector.y * toPy
        if (0 < dot) {
          const len = Math.hypot(toPx, toPy)
          if (len / dot < minLenPerDot) {
            minLenPerDot = len / dot
            minLen = len
            minVecIndex = index
          }
        }
      }
    })
  }

  const pointsFromFrontLeftClockwise = pointsCw
    .slice(minVecIndex)
    .concat(pointsCw.slice(0, minVecIndex))

  const xFL2FR =
    pointsFromFrontLeftClockwise[1].x - pointsFromFrontLeftClockwise[0].x
  const yFL2FR =
    pointsFromFrontLeftClockwise[1].y - pointsFromFrontLeftClockwise[0].y
  const lenFL2FR = Math.hypot(xFL2FR, yFL2FR)
  const xFL2BL =
    pointsFromFrontLeftClockwise[3].x - pointsFromFrontLeftClockwise[0].x
  const yFL2BL =
    pointsFromFrontLeftClockwise[3].y - pointsFromFrontLeftClockwise[0].y
  const lenFL2BL = Math.hypot(xFL2BL, yFL2BL)
  const unitVectorFLtoFR = { x: xFL2FR / lenFL2FR, y: yFL2FR / lenFL2FR }
  const unitVectorFLtoBL = { x: xFL2BL / lenFL2BL, y: yFL2BL / lenFL2BL }
  const pointBR = getLineIntersection(
      pointsFromFrontLeftClockwise[3],
      {
        x:
          pointsFromFrontLeftClockwise[3].x +
          unitVectorFLtoFR.x,
        y:
          pointsFromFrontLeftClockwise[3].y +
          unitVectorFLtoFR.y,
      },
      pointsFromFrontLeftClockwise[1],
      pointsFromFrontLeftClockwise[2],
    )
    if (!pointBR) throw Error("Max Area Quadrilateral Points is not Quadrilateral.")
    const lengthBLtoBR = Math.hypot(
      pointBR.point.x - pointsFromFrontLeftClockwise[3].x,
      pointBR.point.y - pointsFromFrontLeftClockwise[3].y,
    )

  return {
    pointsFromFrontLeftClockwise: pointsFromFrontLeftClockwise,
    lengthFLtoFR: lenFL2FR,
    lengthFLtoBL: lenFL2BL,
    lengthBLtoBR: lengthBLtoBR,
    unitVectorFLtoFR: unitVectorFLtoFR,
    unitVectorFLtoBL: unitVectorFLtoBL,
    distToCenter: minLen,
    unitVectorToCenter: lines[minVecIndex].normalVector,
  }
}
