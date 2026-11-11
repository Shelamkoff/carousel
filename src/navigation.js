/**
 * Last logical destination for finite navigation, including a partial page.
 * A fractional view below one must never expose an index past the slide array.
 * @param {number} count
 * @param {number} slidesPerView
 * @returns {number}
 */
export function getLastSlideIndex(count, slidesPerView) {
  return Math.max(0, Math.min(count - 1, Math.ceil(count - slidesPerView)))
}
