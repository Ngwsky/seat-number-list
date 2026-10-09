<script lang="ts">
  import { get } from 'svelte/store'
  import {
    createTable,
    FlexRender,
    tableFeatures,
    columnSizingFeature,
    rowAggregationFeature,
    aggregationFn_count,
    aggregationFn_extent,
    aggregationFn_mean,
    aggregationFn_sum,
  } from '@tanstack/svelte-table'
  import type { ColumnDef } from '@tanstack/svelte-table'
  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import type { Subdivision } from '../types/SeatNoList2Svg'


  let { data = $bindable([])}: { data: Array<Subdivision> } = $props()
  let tableContainerRef = $state<HTMLDivElement | undefined>(undefined)

  const features = tableFeatures({
    columnSizingFeature,
    rowAggregationFeature,
    aggregationFns: {
      count: aggregationFn_count,
      extent: aggregationFn_extent,
      mean: aggregationFn_mean,
      sum: aggregationFn_sum,
    },
  })

  const columns: Array<ColumnDef<typeof features, Subdivision>> = [
    {
      header: 'Key',
      accessorFn: (v) => v.consecutiveSeatsLists[0][0].leftmostSeat.area + ':' + v.consecutiveSeatsLists[0][0].leftmostSeat.block + ':' + v.consecutiveSeatsLists[0][0].leftmostSeat.row + ':' + v.consecutiveSeatsLists[0][0].leftmostSeat.seatIndex,
      size: 96,
    },
    {
      header: 'First Row',
      accessorKey: 'firstRow',
      size: 96,
    },
    {
      header: 'Last Row',
      accessorKey: 'lastRow',
      size: 96,
    },
    {
      header: 'Leftmost X',
      accessorKey: 'minSeatX',
      size: 120,
    },
    {
      header: 'Rightmost X',
      accessorKey: 'maxSeatX',
      size: 120,
    },
    {
      header: 'Count',
      accessorFn: (v) => v.consecutiveSeatsLists.reduce((a, c) => {
        return a + c.reduce((sc, cs) => { return sc += cs.rightmostSeat.seatIndex - cs.leftmostSeat.seatIndex + 1}, 0)
      }, 0),
      size: 72,
      aggregationFn: 'sum',
      footer: ({ column }) => column.getAggregationValue<number>().toLocaleString(),
    },
  ]

  const table = createTable({
    features,
    columns,
    get data() {
      return data
    },
  })

  const rows = $derived(table.getRowModel().rows)

  const rowVirtualizer = createVirtualizer<
    HTMLDivElement,
    HTMLTableRowElement
  >({
    get count() {
      return rows.length
    },
    estimateSize: () => 33,
    getScrollElement: () => tableContainerRef ?? null,
    measureElement:
      typeof window !== 'undefined' &&
      navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element.getBoundingClientRect().height
        : undefined,
    overscan: 5,
  })

  // When the container ref becomes available, update the virtualizer
  // so it picks up the scroll element and sets up scroll observers.
  $effect(() => {
    if (tableContainerRef) {
      get(rowVirtualizer).setOptions({
        getScrollElement: () => tableContainerRef ?? null,
      })
    }
  })

  // When row count changes (new pages fetched), push the new count to the virtualizer.
  // The svelte-virtual store adapter doesn't reactively track getter options.
  $effect(() => {
    get(rowVirtualizer).setOptions({ count: rows.length })
  })

  // Svelte action to measure dynamic row heights via the virtualizer
  function measureElement(node: HTMLTableRowElement) {
    get(rowVirtualizer).measureElement(node)
  }
</script>

<div
    class="overflow-auto h-96"
    bind:this={tableContainerRef}
  >
<table class="table table-pin-rows w-auto">
  <thead>
    {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
      <tr>
        {#each headerGroup.headers as header (header.id)}
          <th style='width:{header.column.getSize()}px;'>
            {#if !header.isPlaceholder}
              <FlexRender {header} />
            {/if}
          </th>
        {/each}
      </tr>
    {/each}
  </thead>
  <tbody style="height: {$rowVirtualizer.getTotalSize()}px;">
    {#each $rowVirtualizer.getVirtualItems() as virtualRow (virtualRow.index)}
      {@const row = rows[virtualRow.index]}
      <tr
        data-index={virtualRow.index}
        use:measureElement
        style="display: flex; position: absolute; transform: translateY({virtualRow.start}px); width: 100%;"
      >
        {#each row.getAllCells() as cell (cell.id)}
          <td style="width:{cell.column.getSize()}px;" class={[typeof cell.getValue() === 'number' ? 'text-right': 'text-left' ]}>
            <FlexRender {cell} />
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
    <tfoot>
    {#each table.getFooterGroups() as footerGroup (footerGroup.id)}
      <tr>
        {#each footerGroup.headers as header (header.id)}
          <th style='width:{header.column.getSize()}px;'>
            {#if !header.isPlaceholder}
              <FlexRender footer={header} />
            {/if}
          </th>
        {/each}
      </tr>
    {/each}
  </tfoot>
</table>
</div>