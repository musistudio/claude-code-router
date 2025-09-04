/**rewriteStream
 * 读取源readablestream，返回一个新的readablestream，由processor对源数据进行处理后将返回的新值推送到新的stream，如果没有返回值则不推送
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
