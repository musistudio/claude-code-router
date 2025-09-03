export class SSEParserTransform extends TransformStream<string, any> {
    private buffer = '';
    private currentEvent: Record<string, any> = {};

    constructor() {
        super({
            transform: (chunk: string, controller) => {
                const decoder = new TextDecoder();
                const text = decoder.decode(chunk);
                this.buffer += text;
                const lines = this.buffer.split('\n');

                // 保留最后一行（可能不完整）
                this.buffer = lines.pop() || '';

                for (const line of lines) {
                    const event = this.processLine(line);
                    if (event) {
                        controller.enqueue(event);
                    }
                }
            },
            flush: (controller) => {
                // 处理缓冲区中剩余的内容
                if (this.buffer.trim()) {
                    const events: any[] = [];
                    this.processLine(this.buffer.trim(), events);
                    events.forEach(event => controller.enqueue(event));
                }

                // 推送最后一个事件（如果有）
                if (Object.keys(this.currentEvent).length > 0) {
                    controller.enqueue(this.currentEvent);
                }
            }
        });
    }

    private processLine(line: string, events?: any[]): any | null {
        if (!line.trim()) {
            if (Object.keys(this.currentEvent).length > 0) {
                const event = { ...this.currentEvent };
                this.currentEvent = {};
                if (events) {
                    events.push(event);
                    return null;
                }
                return event;
            }
            return null;
        }

        if (line.startsWith('event:')) {
            this.currentEvent.event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (data === '[DONE]') {
                this.currentEvent.data = { type: 'done' };
            } else {
                try {
                    this.currentEvent.data = JSON.parse(data);
                } catch (e) {
                    this.currentEvent.data = { raw: data, error: 'JSON parse failed' };
                }
            }
        } else if (line.startsWith('id:')) {
            this.currentEvent.id = line.slice(3).trim();
        } else if (line.startsWith('retry:')) {
            this.currentEvent.retry = parseInt(line.slice(6).trim());
        }
        return null;
    }
}
