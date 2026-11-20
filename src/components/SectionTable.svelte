<script lang="ts">
  import { get } from "svelte/store"
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
    rowSelectionFeature,
  } from "@tanstack/svelte-table"
  import type { ColumnDef } from "@tanstack/svelte-table"
  import { createVirtualizer } from "@tanstack/svelte-virtual"
  import type { Section } from "../types/SeatNoList2Svg"

  let blockSelected: number = $state(-1)
  let blockSelectOptions: Array<string> = $state([])
  let selectedRowData: Section
  let { data = $bindable([]) }: { data: Array<Section> } = $props()
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
    rowSelectionFeature,
  })

  const columns: Array<ColumnDef<typeof features, Section>> = [
    {
      header: "Key",
      accessorFn: (v) =>
        v.consecutiveSeatsLists[0][0].leftmostSeat.area +
        ":" +
        v.consecutiveSeatsLists[0][0].leftmostSeat.block +
        ":" +
        v.consecutiveSeatsLists[0][0].leftmostSeat.row +
        ":" +
        v.consecutiveSeatsLists[0][0].leftmostSeat.seatIndex,
      size: 136,
      aggregationFn: "count",
      footer: ({ column }) =>
        column.getAggregationValue<number>().toLocaleString(),
    },
    {
      header: "Min Row",
      accessorKey: "firstRow",
      size: 96,
    },
    {
      header: "Max Row",
      accessorKey: "lastRow",
      size: 96,
    },
    {
      header: "Min X",
      accessorKey: "minSeatX",
      size: 80,
    },
    {
      header: "Max X",
      accessorKey: "maxSeatX",
      size: 80,
    },
    {
      header: "Count",
      accessorFn: (v) =>
        v.consecutiveSeatsLists.reduce((a, c) => {
          return (
            a +
            c.reduce((sc, cs) => {
              return (sc +=
                cs.rightmostSeat.seatIndex - cs.leftmostSeat.seatIndex + 1)
            }, 0)
          )
        }, 0),
      size: 88,
      aggregationFn: "sum",
      footer: ({ column }) =>
        column.getAggregationValue<number>().toLocaleString(),
    },
    {
      header: "Block ID",
      accessorFn: (v) => v.blockElement?.element.id,
      size: 120,
    },
  ]

  const table = createTable({
    features,
    columns,
    get data() {
      return data
    },
    enableMultiRowSelection: false,
  })

  const rows = $derived(table.getRowModel().rows)

  const rowVirtualizer = createVirtualizer<HTMLDivElement, HTMLTableRowElement>(
    {
      get count() {
        return rows.length
      },
      estimateSize: () => 33,
      getScrollElement: () => tableContainerRef ?? null,
      measureElement:
        typeof window !== "undefined" &&
        navigator.userAgent.indexOf("Firefox") === -1
          ? (element) => element.getBoundingClientRect().height
          : undefined,
      overscan: 5,
    },
  )

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

  $effect(() => {
    const rows = table.getSelectedRowModel().rows
    rows.forEach((r) => {
      selectedRowData = data[r.index]
      if (1 < selectedRowData.blockOptions.length) {
        const options: Array<string> = []
        selectedRowData.blockOptions.forEach((b, i) => {
          options.push(b.element.id)
          if (selectedRowData.blockElement === b) blockSelected = i
        })
        blockSelectOptions = options
        const modal = document.getElementById("section_modal")
        if (modal && modal instanceof HTMLDialogElement) modal.showModal()
      }
    })
  })

  function changeBlock() {
    if (selectedRowData.blockElement !== selectedRowData.blockOptions[blockSelected]) {
      selectedRowData.blockElement = selectedRowData.blockOptions[blockSelected]
      data = data.slice()
    }
  }

  function unSelect() {
    table.getSelectedRowModel().rows.forEach(r => {
      r.toggleSelected()
    })
  }
</script>

<dialog id="section_modal" class="modal">
  <div class="modal-box">
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Block</legend>
      <select class="select" bind:value={blockSelected} onchange={changeBlock}>
        {#each blockSelectOptions as opt, index}
          <option value={index}>
            {opt}
          </option>
        {/each}
      </select>
      <span class="label">Select target block</span>
    </fieldset>
    <div class="modal-action">
      <form method="dialog">
        <!-- if there is a button in form, it will close the modal -->
        <button class="btn" onclick={unSelect}>Close</button>
      </form>
    </div>
  </div>
</dialog>
<div class="overflow-auto h-96 w-min" bind:this={tableContainerRef}>
  <table class="table table-pin-rows w-auto">
    <thead>
      {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
        <tr>
          {#each headerGroup.headers as header (header.id)}
            <th style="min-width:{header.column.getSize()}px;" class="truncate">
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
          class={[
            row.getIsSelected()
              ? "bg-primary text-primary-content"
              : "hover:bg-primary/[.08]",
          ]}
          onclick={row.getToggleSelectedHandler()}
          style="display: flex; position: absolute; transform: translateY({virtualRow.start}px); width: 100%;"
        >
          {#each row.getAllCells() as cell (cell.id)}
            <td
              style="min-width:{cell.column.getSize()}px;"
              class={[
                typeof cell.getValue() === "number"
                  ? "text-right"
                  : "text-left",
                "truncate",
              ]}
            >
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
            <th
              style="min-width:{header.column.getSize()}px;"
              class="text-right truncate"
            >
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
