/**
 * Utility functions for formatting numbers in the dashboard
 */

/**
 * Format response time - shows seconds for values >= 1000ms
 * @param ms - Time in milliseconds
 * @returns Formatted time string (e.g., "3.4s" or "850ms")
 */
export const formatResponseTime = (ms: number): string => {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
};

/**
 * Format percentage with max 1 decimal place
 * @param num - Number to format as percentage
 * @returns Formatted percentage string (e.g., "26.7%")
 */
export const formatPercentage = (num: number): string => {
  // Handle edge cases
  if (isNaN(num) || !isFinite(num)) return '0.0%';
  
  // Round to 1 decimal place
  const rounded = Math.round(num * 10) / 10;
  return `${rounded.toFixed(1)}%`;
};

/**
 * Format large numbers with K suffix for thousands
 * @param num - Number to format
 * @returns Formatted number string (e.g., "2.1K" or "850")
 */
export const formatNumber = (num: number): string => {
  if (isNaN(num) || !isFinite(num)) return '0';
  
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

/**
 * Format token count with appropriate suffix
 * @param tokens - Token count to format
 * @returns Formatted token string (e.g., "2.1K" or "850")
 */
export const formatTokens = (tokens: number): string => {
  return formatNumber(tokens);
};

/**
 * Format success rate from error rate (inverts the percentage)
 * @param errorRate - Error rate percentage
 * @returns Formatted success rate string
 */
export const formatSuccessRate = (errorRate: number): string => {
  const successRate = 100 - errorRate;
  return formatPercentage(successRate);
};

/**
 * Get color class based on response time thresholds
 * @param ms - Response time in milliseconds
 * @returns CSS color class name
 */
export const getResponseTimeColor = (ms: number): string => {
  if (ms > 2000) return 'text-red-400';
  if (ms > 1000) return 'text-yellow-400';
  return 'text-green-400';
};

/**
 * Get color class based on error rate thresholds
 * @param errorRate - Error rate percentage
 * @returns CSS color class name
 */
export const getErrorRateColor = (errorRate: number): string => {
  if (errorRate > 5) return 'text-red-400';
  if (errorRate > 1) return 'text-yellow-400';
  return 'text-green-400';
};