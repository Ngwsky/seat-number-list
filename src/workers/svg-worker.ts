/// <reference lib="webworker" />

self.onmessage = (event: MessageEvent) => {
  const file = event.data
  const reader = new FileReaderSync()
  const text = reader.readAsText(file, "utf-8")

  self.postMessage({
    text: text,
  })
}
