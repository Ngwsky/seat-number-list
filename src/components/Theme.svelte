<script lang="ts">
  import { onMount } from 'svelte'
  import { theme } from '../stores/settings'

  let isDefaultDark: boolean = $state(false)
  let checked = $state(false)

  onMount(() => {
    isDefaultDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    checked = isDefaultDark ? theme.get() == 'light' : theme.get() == 'dark'
  })

  $effect(() => {
    if (checked)
        if (isDefaultDark) theme.set('light')
        else theme.set('dark')
    else theme.set(undefined)
  })
</script>

<label class="swap swap-rotate text-xl">
  <input type="checkbox" class="theme-controller" bind:checked={checked} value={isDefaultDark ? 'light' : 'dark'} />
  <span class={["icon-[ic--outline-light-mode]", isDefaultDark ? "swap-on" : "swap-off"]}></span>
  <span class={["icon-[ic--outline-dark-mode]", isDefaultDark ? "swap-off" : "swap-on"]}></span>
</label>