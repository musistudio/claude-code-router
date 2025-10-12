import { Transformer } from '@musistudio/llms';

/**
 * OpenRouter Plan Transformer
 * Enables plan mode by default for OpenRouter models and handles multiple-step queries
 * to maximize token usage per request.
 */
export class OpenRouterPlanTransformer extends Transformer {
  constructor(options: any = {}) {
    super(options);
  }

  // Modify the request before sending to OpenRouter
  public req(req: any): any {
    // Enable plan mode by default for OpenRouter models
    if (req.body && typeof req.body === 'object') {
      // If there's no thinking parameter set but we want to enable plan mode by default
      if (!req.body.thinking) {
        req.body.thinking = true;
      }
      
      // Add a system message to encourage multi-step thinking if not already present
      if (!req.body.system) {
        req.body.system = [];
      }
      
      // Add instructions for multi-step processing if needed
      const multiStepInstruction = "Think through this step by step. Break complex problems into smaller parts and solve them systematically. Provide detailed reasoning in multiple steps if needed.";
      
      // Check if this instruction already exists
      if (Array.isArray(req.body.system)) {
        const hasMultiStepInstruction = req.body.system.some((item: any) => 
          typeof item === 'object' && item.text && item.text.includes(multiStepInstruction)
        );
        
        if (!hasMultiStepInstruction) {
          req.body.system.push({
            type: "text",
            text: multiStepInstruction
          });
        }
      } else if (typeof req.body.system === 'string' && !req.body.system.includes(multiStepInstruction)) {
        req.body.system = [req.body.system, multiStepInstruction].join('\n\n');
      }

      // Maximize token usage by setting higher max_tokens if not already set
      // but only if it's not already set too high
      if (!req.body.max_tokens || req.body.max_tokens < 4096) {
        // Use a high value that's suitable for OpenRouter but within reasonable limits
        req.body.max_tokens = Math.min(req.body.max_tokens || 0, 8000) || 8000;
      }
      
      // For token maximization, we might want to consider the context window of the model
      // and try to use as much of the input as possible while leaving room for output
      if (req.body.model) {
        // Increase max_tokens based on the model's capabilities if not set
        const modelSpecificMax = this.getModelMaxTokens(req.body.model);
        if (!req.body.max_tokens) {
          req.body.max_tokens = modelSpecificMax;
        } else {
          // Ensure we're using a reasonable portion of the model's capacity
          req.body.max_tokens = Math.min(req.body.max_tokens, modelSpecificMax);
        }
      }
      
      // Enhance messages to include multi-step instruction if it's a complex request
      if (Array.isArray(req.body.messages)) {
        // Check if the last user message is complex and might benefit from step-by-step processing
        const lastUserMessage = req.body.messages
          .filter((msg: any) => msg.role === 'user')
          .pop();
        
        if (lastUserMessage && typeof lastUserMessage.content === 'string') {
          // If the message seems to require planning, enhance it
          if (this.requiresPlanning(lastUserMessage.content)) {
            // Append a multi-step instruction to the last user message content
            if (typeof lastUserMessage.content === 'string') {
              lastUserMessage.content += "\n\nPlease think through this step by step, breaking it down into clear, logical steps.";
            } else if (Array.isArray(lastUserMessage.content)) {
              const textPart = lastUserMessage.content.find((part: any) => part.type === 'text');
              if (textPart && textPart.text) {
                textPart.text += "\n\nPlease think through this step by step, breaking it down into clear, logical steps.";
              }
            }
          }
        }
      }
    }
    
    return req;
  }

  // Modify the response after receiving from OpenRouter
  public res(res: any): any {
    return res;
  }
  
  /**
   * Determine if a message requires planning based on keywords that suggest
   * complex, multi-step processing
   */
  private requiresPlanning(message: string): boolean {
    const planningKeywords = [
      'how', 'why', 'explain', 'analyze', 'summarize', 'outline', 
      'compare', 'evaluate', 'describe', 'plan', 'strategy', 'process',
      'steps', 'detailed', 'comprehensive', 'break down', 'think through'
    ];
    
    const lowerMsg = message.toLowerCase();
    return planningKeywords.some(keyword => lowerMsg.includes(keyword));
  }
  
  /**
   * Get model-specific max token configuration
   */
  private getModelMaxTokens(model: string): number {
    // Common OpenRouter models and their context window sizes
    if (model.includes('claude-3.5-sonnet') || model.includes('claude-3-5-sonnet')) {
      return 8000; // Claude 3.5 Sonnet has ~200K context, response limit is ~8K
    } else if (model.includes('claude-3-opus')) {
      return 8000;
    } else if (model.includes('claude-3-haiku')) {
      return 8000;
    } else if (model.includes('gpt-4') && !model.includes('mini')) {
      return 4096;
    } else if (model.includes('gpt-4-turbo') || model.includes('gpt-4o')) {
      return 4096;
    } else if (model.includes('gemini-2.5-pro')) {
      return 8192;
    } else if (model.includes('gemini-2.5-flash')) {
      return 8192;
    } else if (model.includes('llama-3.1') || model.includes('llama3.1')) {
      return 8192;
    } else {
      // Default for other models
      return 4096;
    }
  }
}