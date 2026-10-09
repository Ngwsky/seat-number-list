<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { SeatNo, ConsecutiveSeats, Subdivision } from '../types/SeatNoList2Svg'
  import SnlWorker from '../workers/snl-worker?worker'
  import SeatNoTable from './SeatNoTable.svelte'
  import ConsecutiveSeatsTable from './ConsecutiveSeatsTable.svelte'
  import SubdivisionTable from './SubdivisionTable.svelte'
  
  let isLoadingXlsx = $state<boolean>(false)
  let isLoadingSvg = $state<boolean>(false)
  let filesXlsx = $state<FileList | null>(null)
  let filesSvg = $state<FileList | null>(null)
  let isInvalidFileXlsx = $state(false)
  let isInvalidFileSvg = $state(false)
  let snlWorker: Worker | null = null;
  let seatNoList: Array<SeatNo> = $state([])
  let consecutiveSeatsList: Array<ConsecutiveSeats> = $state([])
  let subdivisionList: Array<Subdivision> = $state([])
  let svgContent = $state<Element | null>(null)
  let viewBox = { x: 0, y: 0, w: 300, h: 300 }
  let isDragging = false
  let startX = 0
  let startY = 0
  let xVal = $state(0.0)
  let yVal = $state(0.0)

  function draggingFlgOff() {
    isDragging = false
  }

  onMount(() => {
    snlWorker = new SnlWorker()
    snlWorker.onmessage = (event: MessageEvent) => {
      seatNoList = event.data.seatNoList
      consecutiveSeatsList = event.data.consecutiveSeatsList
      subdivisionList = event.data.subdivisionList
      isLoadingXlsx = false
    }
    snlWorker.onerror = function(error) {
      isLoadingXlsx = false
      isInvalidFileXlsx = true
      console.error(error)
    }
    window.addEventListener('mouseup', draggingFlgOff)
  })

  onDestroy(() => {
    if (snlWorker) snlWorker.terminate()
    window.removeEventListener('mouseup', draggingFlgOff)
  })

  $effect(() => {
    isInvalidFileXlsx = false
    async function readFile(f:File) {
      isLoadingXlsx = true
      try {
        const data = await f.arrayBuffer()

        if (data) {
          if (snlWorker) {
            snlWorker.postMessage(data)
          } else {
            console.log("snlWorker is null.")
          }
        }
      } finally {
        if (!snlWorker) isLoadingXlsx = false
      }
    }

    if (!filesXlsx) return

    readFile(filesXlsx[0])
  })

  $effect(() => {
    isInvalidFileSvg = false

    if (filesSvg) {
      isLoadingSvg = true

      const f = filesSvg[0]

      if (f.type !== 'image/svg+xml') {
        isInvalidFileSvg = true
        return
      }

      const reader = new FileReader();
    
      reader.onload = (e) => {
        const result = e.target?.result

        if (typeof result === 'string') {
          const parser = new DOMParser()
          const doc = parser.parseFromString(result, 'image/svg+xml')
          const svgs = doc.getElementsByTagName('svg')
          
          if (svgs && 0 < svgs.length) {
            svgs[0].setAttribute('width','50dvw')
            svgs[0].setAttribute('height','50dvh')
            svgs[0].viewBox.baseVal.x = viewBox.x
            svgs[0].viewBox.baseVal.y = viewBox.y
            svgs[0].viewBox.baseVal.width = viewBox.w
            svgs[0].viewBox.baseVal.height = viewBox.h
            svgs[0].setAttribute('id', 'venue_svg')
            svgContent?.append(svgs[0])
            const svgel = document.getElementById('venue_svg')
            if (svgel && svgel instanceof SVGSVGElement) {
              svgel.addEventListener('mousemove', (e) => {
                if (isDragging) {
                  const dx = e.clientX - startX
                  const dy = e.clientY - startY
                  const scaleX = viewBox.w / svgel.clientWidth
                  const scaleY = viewBox.h / svgel.clientHeight
                  viewBox.x -= dx * scaleX
                  viewBox.y -= dy * scaleY
                  startX = e.clientX
                  startY = e.clientY
                  svgel.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`)
                }
                const rect = svgel.getBoundingClientRect()
                const viewbox = svgel.viewBox.baseVal
                const vbWidth = viewbox.width || rect.width
                const vbHeight = viewbox.height || rect.height
                const vbX = viewbox.x || 0
                const vbY = viewbox.y || 0
                const clientX = e.clientX - rect.left
                const clientY = e.clientY - rect.top
                const svgX = (clientX / rect.width) * vbWidth + vbX
                const svgY = (clientY / rect.height) * vbHeight + vbY
                xVal = svgX
                yVal = svgY
              })
              svgel.addEventListener('wheel', (e) => {
                e.preventDefault()
                const rect = svgel.getBoundingClientRect()
                const clientX = e.clientX - rect.left
                const clientY = e.clientY - rect.top
                const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1
                const dw = viewBox.w * (1 - zoomFactor)
                const dh = viewBox.h * (1 - zoomFactor)
                viewBox.x += (clientX / rect.width) * dw
                viewBox.y += (clientY / rect.height) * dh
                viewBox.w *= zoomFactor
                viewBox.h *= zoomFactor
                svgel.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`)
              })
              svgel.addEventListener('mousedown', (e) => {
                isDragging = true
                startX = e.clientX
                startY = e.clientY
              })
            }
          }
        } else {
          isInvalidFileSvg = true
        }

        isLoadingSvg = false
      }

      reader.readAsText(f)
    }

    return
  })
</script>

<div class="p-2 m-2">
  <fieldset class="fieldset">
    <legend class="fieldset-legend">Seat number list</legend>
    <div class="relative flex items-center">
      <input type="file" bind:files={filesXlsx} accept=".xlsx" class={['file-input', 'w-96', {'input-error':isInvalidFileXlsx}]} disabled={isLoadingXlsx} />
    </div>
    {#if isLoadingXlsx}
      <p class="label"><span class="loading loading-spinner"></span>Loading...</p>
    {/if}
    {#if isInvalidFileXlsx}
      <p class="label text-error"><span class="icon-[material-symbols--error-outline]"></span>Invalid file!</p>
    {/if}
  </fieldset>
  {#if 0 < subdivisionList.length}
    <div class="py-2 my-2">
      <div class="py-2 flex justify-between"><h6 class="text-xs font-medium">Subdivision list</h6><span class="text-xs font-medium">{subdivisionList.length} rows</span></div>
      <SubdivisionTable bind:data={subdivisionList}></SubdivisionTable>
    </div>
    <div class="py-2 my-2">
      <div class="py-2 flex justify-between"><h6 class="text-xs font-medium">Consecutive seats list</h6><span class="text-xs font-medium">{consecutiveSeatsList.length} rows</span></div>
      <ConsecutiveSeatsTable bind:data={consecutiveSeatsList}></ConsecutiveSeatsTable>
    </div>
    <div class="py-2 my-2">
      <div class="py-2 flex justify-between"><h6 class="text-xs font-medium">Seat list</h6><span class="text-xs font-medium">{seatNoList.length} rows</span></div>
      <SeatNoTable bind:data={seatNoList}></SeatNoTable>
    </div>
  {/if}
</div>
<div class="p-2 m-2 w-1/2">
  <fieldset class="fieldset">
    <legend class="fieldset-legend">Venue SVG</legend>
    <div class="relative flex items-center">
      <input type="file" bind:files={filesSvg} accept=".svg" class={['file-input', 'w-96', {'input-error':isInvalidFileSvg}]} disabled={isLoadingSvg} />
    </div>
    {#if isLoadingSvg}
      <p class="label"><span class="loading loading-spinner"></span>Loading...</p>
    {/if}
    {#if isInvalidFileSvg}
      <p class="label text-error"><span class="icon-[material-symbols--error-outline]"></span>Invalid file!</p>
    {/if}
  </fieldset>
  <div class="py-2 my-2 w-full" bind:this={svgContent}>
  </div>
  {xVal.toFixed(2)}, {yVal.toFixed(2)}
</div>