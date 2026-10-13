<script lang="ts">
  import { svgHoverPoint } from "../stores/store"
  import { seatNoListFileName, svgFileName } from "../stores/settings"
</script>

<aside class="grid-flow-col items-center text-lg">
  <span class={["icon-[mdi--table-arrow-right]", $seatNoListFileName ? "text-base-content" : "text-base-content/38"]}></span>
  <span class={["icon-[iconmind--stadium-outline-regular]", $svgFileName ? "text-base-content" : "text-base-content/38"]}></span>
</aside>
{#if $svgHoverPoint && $svgHoverPoint.x && $svgHoverPoint.y}
  <span class="justify-self-end font-mono text-xs"
    >{$svgHoverPoint.x.toFixed(2)}, {$svgHoverPoint.y.toFixed(2)}</span
  >
{/if}
