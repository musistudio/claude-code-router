/**
 * Rewrite stream utility
 * Reads source readablestream and returns a new readablestream,
 * processor processes source data and pushes returned new value to new stream,
 * no push if no return value
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
      } catch (error) {
        controller.error(error)
      } finally {
        reader.releaseLock()
      }
    }
  })
}
