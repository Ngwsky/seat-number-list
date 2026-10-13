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
  import type { ConsecutiveSeats } from '../types/SeatNoList2Svg'


  let { data = $bindable([])}: { data: Array<ConsecutiveSeats> } = $props()
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

  const columns: Array<ColumnDef<typeof features, ConsecutiveSeats>> = [
    {
      header: 'Key',
      accessorFn: (v) => v.leftmostSeat.area + ':' + v.leftmostSeat.block + ':' + v.leftmostSeat.row + ':' + v.leftmostSeat.seatIndex,
      size: 120,
      aggregationFn: 'count',
      footer: ({ column }) => column.getAggregationValue<number>().toLocaleString(),
    },
    {
      header: 'Area',
      accessorKey: 'leftmostSeat.area',
      size: 72,
    },
    {
      header: 'Block',
      accessorKey: 'leftmostSeat.block',
      size: 80,
    },
    {
      header: 'Row',
      accessorKey: 'leftmostSeat.row',
      size: 64,
    },
    {
      header: 'Leftmost',
      accessorKey: 'leftmostSeat.seatIndex',
      size: 104,
    },
    {
      header: 'Rightmost',
      accessorKey: 'rightmostSeat.seatIndex',
      size: 112,
    },
    {
      header: 'Count',
      accessorFn: (v) => v.rightmostSeat.seatIndex - v.leftmostSeat.seatIndex + 1,
      size: 88,
      aggregationFn: 'sum',
      footer: ({ column }) => column.getAggregationValue<number>().toLocaleString(),
    },
    {
      header: 'Section',
      accessorFn: (v) => v.section?.consecutiveSeatsLists[0][0].leftmostSeat.area + ':' + v.section?.consecutiveSeatsLists[0][0].leftmostSeat.block + ':' + v.section?.consecutiveSeatsLists[0][0].leftmostSeat.row + ':' + v.section?.consecutiveSeatsLists[0][0].leftmostSeat.seatIndex,
      size: 120,
    }
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
    class="overflow-auto h-96 w-min"
    bind:this={tableContainerRef}
  >
<table class="table table-pin-rows w-auto">
  <thead>
    {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
      <tr>
        {#each headerGroup.headers as header (header.id)}
          <th style='min-width:{header.column.getSize()}px;' class="truncate">
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
          <td style="min-width:{cell.column.getSize()}px;" class={[typeof cell.getValue() === 'number' ? 'text-right': 'text-left', 'truncate']}>
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
          <th style='min-width:{header.column.getSize()}px;' class="text-right truncate">
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
