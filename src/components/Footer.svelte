<script lang="ts">
  import { venue } from "../stores/venue.svelte"
  import {
    seatNoListFileName,
    svgFileName,
    pitchArea,
  } from "../stores/settings"

  let minWidth = $state<number>(pitchArea.get().widthMinPct)
  let maxWidth = $state<number>(pitchArea.get().widthMaxPct)
  let minHeight = $state<number>(pitchArea.get().heightMinPct)
  let maxHeight = $state<number>(pitchArea.get().heightMaxPct)
  let popOverElement = $state<HTMLElement>()

  const openPopover = () => {
    if (popOverElement) {
      minWidth = pitchArea.get().widthMinPct
      maxWidth = pitchArea.get().widthMaxPct
      minHeight = pitchArea.get().heightMinPct
      maxHeight = pitchArea.get().heightMaxPct
      popOverElement.showPopover()
      venue.isShowPitchArea = true
    }
  }

  function applyPitchArea() {
    if (
      minWidth !== pitchArea.get().widthMinPct ||
      maxWidth !== pitchArea.get().widthMaxPct ||
      minHeight !== pitchArea.get().heightMinPct ||
      maxHeight !== pitchArea.get().heightMaxPct
    ) {
      if (maxWidth < minWidth) {
        if (minWidth !== pitchArea.get().widthMinPct) {
          maxWidth = minWidth
        } else {
          minWidth = maxWidth
        }
      }
      if (maxHeight < minHeight) {
        if (minHeight !== pitchArea.get().heightMinPct) {
          maxHeight = minHeight
        } else {
          minHeight = maxHeight
        }
      }
      pitchArea.set({
        widthMinPct: minWidth,
        widthMaxPct: maxWidth,
        heightMinPct: minHeight,
        heightMaxPct: maxHeight,
      })
    }
  }

  function closePopover() {
    venue.isShowPitchArea = false
  }
</script>

<dialog
  id="venue_popover"
  class="modal modal-bottom max-w-max max-h-max bg-transparent transition duration-400 ease-in-out"
  popover="manual"
  bind:this={popOverElement}
>
  <div class="modal-box s-full bg-base-300">
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Venue settings</legend>
      <legend class="fieldset-legend">Pitch area width range</legend>
      <div class="flex flex-row items-center">
        <label class="input input-sm w-24">
          <input
            type="number"
            min="0"
            step="1"
            max="100"
            bind:value={minWidth}
            onblur={applyPitchArea}
          />
          <span class="label ml-0">%</span>
        </label>
        <span class="text-xl mx-2 icon-[gg--arrows-shrink-h]"></span>
        <label class="input input-sm w-24">
          <input
            type="number"
            min="0"
            step="1"
            max="100"
            bind:value={maxWidth}
            onblur={applyPitchArea}
          />
          <span class="label ml-0">%</span>
        </label>
      </div>
      <legend class="fieldset-legend">Pitch area height range</legend>
      <div class="flex flex-row items-center">
        <label class="input input-sm w-24">
          <input
            type="number"
            min="0"
            step="1"
            max="100"
            bind:value={minHeight}
            onblur={applyPitchArea}
          />
          <span class="label ml-0">%</span>
        </label>
        <span class="text-xl mx-2 icon-[gg--arrows-shrink-v]"></span>
        <label class="input input-sm w-24">
          <input
            type="number"
            min="0"
            step="1"
            max="100"
            bind:value={maxHeight}
            onblur={applyPitchArea}
          />
          <span class="label ml-0">%</span>
        </label>
      </div>
      <div class="modal-action">
        <button
          class="btn btn-outline btn-sm"
          popovertarget="venue_popover"
          popovertargetaction="hide"
          onclick={closePopover}
        >
          Close
        </button>
      </div>
    </fieldset>
  </div>
</dialog>
<aside class="grid-flow-col items-center text-lg">
  <span
    class={[
      "icon-[mdi--table-arrow-right]",
      $seatNoListFileName ? "text-base-content" : "text-base-content/38",
    ]}
  ></span>
  <button
    class="btn btn-ghost h-auto px-1"
    onclick={openPopover}
    aria-label="Open venue dialog"
  >
    <span
      class={[
        "icon-[iconmind--stadium-outline-regular]",
        $svgFileName ? "text-base-content" : "text-base-content/38",
      ]}
    ></span>
  </button>
</aside>
{#if venue && venue.x && venue.y}
  <span class="justify-self-end font-mono text-xs"
    >{venue.x.toFixed(2)}, {venue.y.toFixed(2)}</span
  >
{/if}
