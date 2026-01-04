import { UnifiedChatRequest } from "../types/llm";
import { Transformer, TransformerOptions } from "../types/transformer";

export interface CustomParamsOptions extends TransformerOptions {
  /**
   * Custom parameters to inject into the request body
   * Any key-value pairs will be added to the request
   * Supports: string, number, boolean, object, array
   */
  [key: string]: any;
}

/**
 * Transformer for injecting dynamic custom parameters into LLM requests
 * Allows runtime configuration of arbitrary parameters that get merged
 * into the request body using deep merge strategy
 */
export class CustomParamsTransformer implements Transformer {
  static TransformerName = "customparams";
  
  private options: CustomParamsOptions;

  constructor(options: CustomParamsOptions = {}) {
    this.options = options;
  }

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    // Create a copy of the request to avoid mutating the original
    const modifiedRequest = { ...request } as any;
    
    // Inject custom parameters with deep merge
    const parametersToInject = Object.entries(this.options);
    
    for (const [key, value] of parametersToInject) {
      if (key in modifiedRequest) {
        // Deep merge with existing parameter
        if (typeof modifiedRequest[key] === 'object' && 
            typeof value === 'object' && 
            !Array.isArray(modifiedRequest[key]) && 
            !Array.isArray(value) &&
            modifiedRequest[key] !== null &&
            value !== null) {
          // Deep merge objects
          modifiedRequest[key] = this.deepMergeObjects(modifiedRequest[key], value);
        } else {
          // For non-objects, keep existing value (preserve original)
          continue;
        }
      } else {
        // Add new parameter
        modifiedRequest[key] = this.cloneValue(value);
      }
    }

    return modifiedRequest;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    // Pass through response unchanged
    return response;
  }



  /**
   * Deep merge two objects recursively
   */
  private deepMergeObjects(target: any, source: any): any {
    const result = { ...target };
    
    for (const [key, value] of Object.entries(source)) {
      if (key in result && 
          typeof result[key] === 'object' && 
          typeof value === 'object' &&
          !Array.isArray(result[key]) && 
          !Array.isArray(value) &&
          result[key] !== null &&
          value !== null) {
        result[key] = this.deepMergeObjects(result[key], value);
      } else {
        result[key] = this.cloneValue(value);
      }
    }
    
    return result;
  }

  /**
   * Clone a value to prevent reference issues
   */
  private cloneValue(value: any): any {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.cloneValue(item));
    }
    
    const cloned: any = {};
    for (const [key, val] of Object.entries(value)) {
      cloned[key] = this.cloneValue(val);
    }
    return cloned;
  }
}