/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return function (...args: Parameters<T>): void {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = undefined;
    }, wait);
  };
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds.
 */
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return function (...args: Parameters<T>): void {
    const now = Date.now();
    const remaining = wait - (now - lastTime);

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      lastTime = now;
      func(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastTime = Date.now();
        timeoutId = undefined;
        func(...args);
      }, remaining);
    }
  };
}
