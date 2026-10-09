<script lang="ts">
  import { get } from 'svelte/store'
  import {
    createTable,
    FlexRender,
    tableFeatures,
    columnSizingFeature,
  } from '@tanstack/svelte-table'
  import type { ColumnDef } from '@tanstack/svelte-table'
  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import type { SeatNo } from '../types/SeatNoList2Svg'


  let { data = $bindable([])}: { data: Array<SeatNo> } = $props()
  let tableContainerRef = $state<HTMLDivElement | undefined>(undefined)

  const features = tableFeatures({
    columnSizingFeature,
  })

  const columns: Array<ColumnDef<typeof features, SeatNo>> = [
    {
      header: 'Key',
      accessorFn: (v) => v.area + ':' + v.block + ':' + v.row + ':' + v.seatIndex,
      size: 96,
    },
    {
      header: 'Area',
      accessorKey: 'area',
      size: 62,
    },
    {
      header: 'Block',
      accessorKey: 'block',
      size: 68,
    },
    {
      header: 'Row',
      accessorKey: 'row',
      size: 62,
    },
    {
      header: 'Seat',
      accessorKey: 'seatIndex',
      size: 62,
    },
    {
      header: 'Offset',
      accessorKey: 'colOffset',
      size: 74,
    },
    {
      header: 'Leftmost',
      accessorKey: 'isLeftmost',
      size: 74,
    },
    {
      header: 'Rightmost',
      accessorKey: 'isRightmost',
      size: 74,
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
</table>
</div>
<div class="flex justify-between"><span class="text-sm font-medium">Seat Number List</span><span class="text-sm font-medium">{data.length} rows</span></div>
