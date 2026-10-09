<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { read, utils } from 'xlsx'
  import type { SeatNo, ConsecutiveSeats } from '../types/SeatNoList2Svg'
  import SnlWorker from '../workers/snl-worker?worker'
  import SeatNoTable from './SeatNoTable.svelte'
  import ConsecutiveSeatsTable from './ConsecutiveSeatsTable.svelte'
  
  let isLoading = $state<boolean>(false)
  let files = $state<FileList | null>(null)
  let snlWorker: Worker | null = null;
  let isInvalidFile = $state(false)
  let seatNoList:Array<SeatNo> = $state([])
  let consecutiveSeatsList:Array<ConsecutiveSeats> = $state([])

  onMount(() => {
    snlWorker = new SnlWorker()
    snlWorker.onmessage = (event: MessageEvent) => {
      seatNoList = event.data.seatNoList
      consecutiveSeatsList = event.data.consecutiveSeatsList
      isLoading = false
    }
    snlWorker.onerror = function(error) {
      isLoading = false
      isInvalidFile = true
      console.error(error)
    }
  })

  onDestroy(() => {
    if (snlWorker) snlWorker.terminate()
  })

  $effect(() => {
    isInvalidFile = false
    async function readFile(f:File) {
      isLoading = true
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
        if (!snlWorker) isLoading = false
      }
    }

    if (!files) return

    readFile(files[0])
  })
</script>

<div class="p-2 m-2">
<fieldset class="fieldset">
  <legend class="fieldset-legend">Seat number list</legend>
  <div class="relative flex items-center">
    <input type="file" bind:files accept=".xlsx" class={['file-input', 'w-96', {'input-error':isInvalidFile}]} disabled={isLoading} />
  </div>
  {#if isLoading}
  <p class="label"><span class="loading loading-spinner"></span>Loading...</p>
  {/if}
  {#if isInvalidFile}
  <p class="label text-error"><span class="icon-[material-symbols--error-outline]"></span>Invalid file!</p>
  {/if}
</fieldset>
</div>
<div class="p-2 m-2">
  <SeatNoTable bind:data={seatNoList}></SeatNoTable>
</div>
<div class="p-2 m-2">
  <ConsecutiveSeatsTable bind:data={consecutiveSeatsList}></ConsecutiveSeatsTable>
</div>
