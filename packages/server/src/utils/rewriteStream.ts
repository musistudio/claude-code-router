/**rewriteStream
 * Read source readablestream and return a new readablestream, processor processes source data and pushes returned new value to new stream, no push if no return value
 * @param stream
 * @param processor
 */
export const rewriteStream = (stream: ReadableStream, processor: (data: any, controller: ReadableStreamController<any>) => Promise<any>): ReadableStream => {
  const reader = stream.getReader()

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            break
          }

          const processed = await processor(value, controller)
          if (processed !== undefined) {
            controller.enqueue(processed)
          }
        }
      } catch (error: any) {
        if (
          error?.name === 'AbortError' ||
          error?.code === 'ERR_STREAM_PREMATURE_CLOSE'
        ) {
          try {
            controller.close()
          } catch {}
          return
        }

        controller.error(error)
      } finally {
        reader.releaseLock()
      }
    }
  })
}
