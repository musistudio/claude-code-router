export interface CustomRouterHooks {
  /**
   * Makes routing decision for a request
   * @param req - The incoming request
   * @param config - Router configuration (includes {failover: true} when requesting failover route)
   * @returns Provider key in format 'provider,model' (e.g., 'zai,glm-4.7')
   */
  route: (req: any, config: any) => string | Promise<string>;

  /**
   * Optional: Check if router can acquire a slot for this provider
   * Used for implementing custom queueing logic
   * @param routeKey - The provider key (e.g., 'zai,glm-4.7')
   * @returns true if request can proceed, false to trigger failover
   */
  canAcquireSlot?: (routeKey: string) => Promise<boolean>;

  /**
   * Optional: Called when request starts executing
   * @param routeKey - The provider key being used
   */
  onRequestStart?: (routeKey: string) => void;

  /**
   * Optional: Called when request completes successfully
   * @param routeKey - The provider key that completed
   */
  onRequestComplete?: (routeKey: string) => void;

  /**
   * Optional: Called when request fails or is aborted
   * @param routeKey - The provider key that failed
   * @param error - The error that occurred
   */
  onRequestError?: (routeKey: string, error: Error) => void;
}

// Backward compatibility: support both function and object routers
export type CustomRouter = CustomRouterHooks | ((req: any, config: any) => string | Promise<string>);
