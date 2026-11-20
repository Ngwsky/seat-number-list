<script lang="ts">
  import Theme from "../components/Theme.svelte"
  import Footer from "../components/Footer.svelte"
  import SeatNoList2Svg from "../components/SeatNoList2Svg.svelte"
</script>

<div class="min-h-screen pb-12">
  <div class="navbar shadow-sm min-h-2">
    <div class="flex-1">
      <a class="btn btn-ghost text-md h-auto" href="/"
        >Seat Number List to SVG</a
      >
    </div>
    <div class="flex-none">
      <Theme />
    </div>
  </div>
  <main class="@container">
    <div class="flex flex-row flex-wrap m-auto w-full bg-base-200 font-mono">
      <SeatNoList2Svg />
    </div>
  </main>
  <footer
    class="fixed bottom-0 left-0 w-full footer footer-horizontal bg-base-100 items-center px-4 py-2 z-50"
  >
    <Footer />
  </footer>
</div>
