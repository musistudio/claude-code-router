import { FastifyRequest, FastifyReply } from "fastify";
import { log } from "../utils/log";

interface AnthropicRequest extends FastifyRequest {
    rawProvider?: {
        type: string;
        name: string;
        api_base_url: string;
        api_key: string;
    };
    selectedModel?: string;
}

export const anthropicPassthrough = async (req: AnthropicRequest, reply: FastifyReply) => {
    if (req.rawProvider && req.rawProvider.type === "anthropic") {
        log("Forwarding to anthropic provider:", req.rawProvider.name);

        try {
            // Smart URL construction - avoid duplicate /v1/messages
            let baseUrl = req.rawProvider.api_base_url;
            let requestPath = req.url;

            // If base URL already ends with /v1/messages, don't append the request path
            if (baseUrl.endsWith('/v1/messages') && requestPath.startsWith('/v1/messages')) {
                requestPath = '';
            }

            const targetUrl = `${baseUrl}${requestPath}`;
            log("Target URL:", targetUrl);

            // Prepare headers for anthropic API
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "anthropic-version": "2023-06-01",
                "x-api-key": req.rawProvider.api_key,
            };

            // Forward user agent if present
            if (req.headers["user-agent"]) {
                headers["user-agent"] = req.headers["user-agent"];
            }

            // Override model in request body with selected model
            const requestBody = {
                ...(req.body as Record<string, any>),
                model: req.selectedModel
            };

            log("Request Body:", requestBody);

            const response = await fetch(targetUrl, {
                method: req.method,
                headers,
                body: JSON.stringify(requestBody),
            });

            // Check if response is streaming (SSE)
            const contentType = response.headers.get('content-type');
            const isStreaming = contentType?.includes('text/event-stream') ||
                contentType?.includes('text/plain') ||
                (requestBody as any).stream === true;

            log("Response Content-Type:", contentType);
            log("Is Streaming:", isStreaming);

            // Forward all response headers except problematic ones for proxying
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                const lowerKey = key.toLowerCase();
                // Only filter out headers that can cause proxying issues
                if (!['transfer-encoding'].includes(lowerKey)) {
                    responseHeaders[key] = value;
                }
            });

            reply.status(response.status);

            if (isStreaming && response.body) {
                // Handle streaming response
                log("Handling streaming response");

                // Set response headers (keep original headers, especially content-type)
                Object.entries(responseHeaders).forEach(([key, value]) => {
                    reply.header(key, value);
                });

                const reader = response.body.getReader();

                try {
                    while (true) {
                        const { done, value } = await reader.read();

                        if (done) {
                            log("Stream completed");
                            break;
                        }

                        // Direct binary transfer - no need to decode/encode
                        log("Streaming chunk size:", value.byteLength, "bytes");

                        reply.raw.write(value);
                    }
                } catch (streamError: any) {
                    log("Stream error:", streamError.message);
                } finally {
                    reader.releaseLock();
                    reply.raw.end();
                }
            } else {
                // Handle non-streaming response
                log("Handling non-streaming response");

                // Set response headers
                Object.entries(responseHeaders).forEach(([key, value]) => {
                    reply.header(key, value);
                });

                const responseData = await response.text();
                log("Response Data:", responseData);
                reply.send(responseData);
            }

            return reply;
        } catch (error: any) {
            log("Error forwarding to anthropic provider:", error.message);
            reply.status(500).send({ error: "Failed to forward request to anthropic provider" });
            return reply;
        }
    }
}; 