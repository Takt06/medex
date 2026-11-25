export interface PartitionedMobileNav<T> {
  primaryItems: T[];
  overflowItems: T[];
  hasMore: boolean;
}

/**
 * Limits the floating mobile capsule bar to at most `maxSlots` buttons total.
 * When `items.length > maxSlots`, reserves the final slot for the "More" hamburger
 * trigger (`maxSlots - 1` direct buttons + 1 More menu button).
 */
export function partitionMobileNavItems<T>(
  items: readonly T[],
  maxSlots = 5
): PartitionedMobileNav<T> {
  const safeMax = Math.max(2, Math.floor(maxSlots));
  if (items.length <= safeMax) {
    return {
      primaryItems: [...items],
      overflowItems: [],
      hasMore: false,
    };
  }
  const directCount = safeMax - 1;
  return {
    primaryItems: items.slice(0, directCount),
    overflowItems: items.slice(directCount),
    hasMore: true,
  };
}
