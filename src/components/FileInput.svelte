<script lang="ts">
  import { read, utils } from 'xlsx'

  let files = $state<FileList | null>(null)
  let seatlist: any[] = []

  // 2. ファイル選択時のイベントハンドラー
  $effect(() => {
    async function readFile(f:File) {
      const data = await f.arrayBuffer()
      const workbook = read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const jsonData = utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length > 0) {
        seatlist = jsonData.slice(1)
      }
      console.log(JSON.stringify(seatlist))
    }

    if (!files) return

    for (const file of files) {
	    console.log(`${file.name}: ${file.size} bytes`);
	}
    readFile(files[0])
  })
</script>

<input type="file" accept=".xlsx, .xls, .csv" bind:files class="file-input" />