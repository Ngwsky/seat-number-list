<script lang="ts">
  import { tick } from "svelte"
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
  import type { Block } from "../types/SeatNoList2Svg"
  import {
    seatGap,
    marginLeft,
    marginRight,
    marginFront,
    marginBack,
    blockSettings,
    seatAlign,
  } from "../stores/settings"

  let {
    data = $bindable([]),
    refreshSeat,
    openPopover = $bindable(),
  }: {
    data: Array<Block>
    refreshSeat: (blocks: Array<Block>) => any
    openPopover: any
  } = $props()
  let tableContainerRef = $state<HTMLDivElement | undefined>(undefined)
  let selectedRowData: Block | undefined = $state()
  let popOverElement = $state<HTMLElement>()
  let bgap: number = $state(seatGap.get())
  let bsa: "left" | "center" | "right" = $state(seatAlign.get())
  let bmf: number = $state(marginFront.get())
  let bmr: number = $state(marginRight.get())
  let bmb: number = $state(marginBack.get())
  let bml: number = $state(marginLeft.get())

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

  const columns: Array<ColumnDef<typeof features, Block>> = [
    {
      header: "ID",
      accessorFn: (v) => v.element.id,
      size: 112,
      aggregationFn: "count",
      footer: ({ column }) =>
        column.getAggregationValue<number>().toLocaleString(),
    },
    {
      header: "Name",
      accessorFn: (v) => v.element.getAttribute("data-name"),
      size: 96,
    },
    {
      header: "Gap",
      accessorFn: (v) => v.settings?.gap ?? 0,
      size: 80,
    },
    {
      header: "Margin F R B L",
      accessorFn: (v) =>
        `${v.settings?.mf ?? 0} ${v.settings?.mr ?? 0} ${v.settings?.mb ?? 0} ${v.settings?.ml ?? 0}`,
      size: 168,
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
    console.debug("select effect", table.getSelectedRowModel().rows)
    const rows = table.getSelectedRowModel().rows
    if (0 < rows.length) {
      showPopover(data[rows[0].index])
    }
  })

  async function showPopover(block: Block) {
    if (popOverElement && popOverElement.matches(":popover-open")) {
      popOverElement.hidePopover()
      await tick()
    }
    selectedRowData = block
    bgap = selectedRowData.settings?.gap ?? 0
    bsa = selectedRowData.settings?.align ?? seatAlign.get()
    bmf = selectedRowData.settings?.mf ?? 0
    bmr = selectedRowData.settings?.mr ?? 0
    bmb = selectedRowData.settings?.mb ?? 0
    bml = selectedRowData.settings?.ml ?? 0
    if (popOverElement) {
      popOverElement.showPopover()
      popOverElement.classList.add("scale-95")
      setTimeout(() => {
        popOverElement?.classList.remove("scale-95")
      }, 100)
    }
  }

  openPopover = async (block: Block) => {
    table.resetRowSelection(false)
    await tick()
    showPopover(block)
  }

  function applyBlockValue() {
    if (!selectedRowData) return
    let isValueChanged = false
    const gap = bgap === 0 ? undefined : bgap
    const sa = bsa === seatAlign.get() ? undefined : bsa
    const mf = bmf === 0 ? undefined : bmf
    const mr = bmr === 0 ? undefined : bmr
    const mb = bmb === 0 ? undefined : bmb
    const ml = bml === 0 ? undefined : bml
    if (gap || sa || mf || mr || mb || ml) {
      if (!selectedRowData.settings) {
        selectedRowData.settings = {}
      }
      if (selectedRowData.settings.gap !== gap) {
        selectedRowData.settings.gap = gap
        isValueChanged = true
      }
      if (selectedRowData.settings.align !== sa) {
        selectedRowData.settings.align = sa
        isValueChanged = true
      }
      if (selectedRowData.settings.mf !== mf) {
        selectedRowData.settings.mf = mf
        isValueChanged = true
      }
      if (selectedRowData.settings.mr !== mr) {
        selectedRowData.settings.mr = mr
        isValueChanged = true
      }
      if (selectedRowData.settings.mb !== mb) {
        selectedRowData.settings.mb = mb
        isValueChanged = true
      }
      if (selectedRowData.settings.ml !== ml) {
        selectedRowData.settings.ml = ml
        isValueChanged = true
      }
    } else {
      if (selectedRowData.settings) {
        selectedRowData.settings = undefined
        isValueChanged = true
      }
    }

    if (isValueChanged) {
      const bs = blockSettings.get()
      if (selectedRowData.settings) {
        bs[selectedRowData.id] = {
          gap: selectedRowData.settings.gap,
          align: selectedRowData.settings.align,
          mf: selectedRowData.settings.mf,
          mr: selectedRowData.settings.mr,
          mb: selectedRowData.settings.mb,
          ml: selectedRowData.settings.ml,
        }
      } else {
        if (bs[selectedRowData.id]) delete bs[selectedRowData.id]
      }
      blockSettings.set(bs)
      data = data.slice()
      table.getSelectedRowModel().rows.forEach((r) => {
        r.toggleSelected()
      })
      refreshSeat([selectedRowData])
    }
  }
</script>

<dialog
  id="block_popover"
  class="modal modal-bottom max-w-max max-h-max bg-transparent transition duration-400 ease-in-out"
  popover="manual"
  bind:this={popOverElement}
>
  <div class="modal-box s-full bg-base-300">
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Block additional values</legend>
      <div class="flex gap-4">
        <div class="flex flex-col flex-none">
          <label for="block-id" class="input input-sm text-base-content/88 px-2 mt-2"
            ><span class="label w-8 mr-1">ID</span>
            <input
              id="block-id"
              class="input input-sm px-1 w-20"
              value={selectedRowData?.element.id}
              readonly
            /></label
          >
          <label
            for="block-data-name"
            class="input input-sm text-base-content/88 px-2 mt-2"
            ><span class="label w-8 mr-3">Name</span><input
              id="block-data-name"
              class="input input-sm px-1 w-16"
              value={selectedRowData?.element.getAttribute("data-name")}
              readonly
            /></label
          >

          <label for="block-seat-gap" class="label text-base-content/88 mt-2"
            >Mimimum Gap</label
          >
          <input
            id="block-seat-gap"
            type="number"
            class="input input-sm w-32"
            placeholder="0.05"
            bind:value={bgap}
            onblur={applyBlockValue}
          />
          <label for="seat-align" class="label text-base-content/88 mt-2"
            >Seat Align</label
          >
          <select
            id="seat-align"
            class="select select-sm w-32"
            bind:value={bsa}
            onblur={applyBlockValue}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div class="flex flex-col grow place-items-center">
          <label
            for="block-margin-front"
            class="label text-base-content/88 mt-2">Margin Front</label
          >
          <input
            id="block-margin-front"
            type="number"
            class="input input-sm w-32"
            placeholder="0.5"
            bind:value={bmf}
            onblur={applyBlockValue}
          />
          <div class="flex gap-1">
            <div class="flex flex-col">
              <label
                for="block-margin-left"
                class="label text-base-content/88 mt-2">Margin Left</label
              >
              <input
                id="block-margin-left"
                type="number"
                class="input input-sm w-32"
                placeholder="0.5"
                bind:value={bml}
                onblur={applyBlockValue}
              />
            </div>
            <div class="flex flex-col">
              <label
                for="block-margin-right"
                class="label text-base-content/88 mt-2">Margin Right</label
              >
              <input
                id="block-margin-right"
                type="number"
                class="input input-sm w-32"
                placeholder="0.5"
                bind:value={bmr}
                onblur={applyBlockValue}
              />
            </div>
          </div>
          <label for="block-margin-back" class="label text-base-content/88 mt-2"
            >Margin Back</label
          >
          <input
            id="block-margin-right"
            type="number"
            class="input input-sm w-32"
            placeholder="0.5"
            bind:value={bmb}
            onblur={applyBlockValue}
          />
        </div>
      </div>
      <div class="modal-action">
        <button
          class="btn btn-outline"
          popovertarget="block_popover"
          popovertargetaction="hide"
        >
          Close
        </button>
      </div>
    </fieldset>
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
