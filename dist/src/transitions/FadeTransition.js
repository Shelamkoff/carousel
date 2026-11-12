const properties = ['position', 'top', 'left', 'width', 'height', 'opacity', 'visibility', 'transform', 'transition']

function saveStyles(style, names) {
  return names.map(name => [name, style.getPropertyValue?.(name) ?? style[name] ?? '',
    style.getPropertyPriority?.(name) ?? ''])
}

function restoreStyles(style, saved) {
  for (const [name, value, priority] of saved) {
    if (style.setProperty) style.setProperty(name, value, priority)
    else style[name] = value
  }
}

/** Owns temporary stacking styles; Carousel supplies the only animation clock. */
export class FadeTransition {
  #slides
  #track
  #saved
  #trackStyle
  #size
  #sizes
  #copies
  #from
  #to
  #direction
  #progress = 0
  #destroyed = false

  constructor(slides, track, size, viewportSize, orientation, from, to, direction, geometry, copies = []) {
    this.#slides = slides
    this.#track = track
    this.#size = size
    this.#sizes = geometry?.slides.map(slide => slide.size)
    this.#copies = copies.map(element => ({ element, styles: saveStyles(element.style, ['visibility']) }))
    this.#from = from
    this.#to = to
    this.#direction = direction || 1
    this.#saved = slides.map(slide => saveStyles(slide.style, properties))
    this.#trackStyle = track ? saveStyles(track.style, ['height', 'transform']) : []
    const vertical = orientation === 'vertical'
    if (track) {
      track.style.height = (vertical ? viewportSize : track.offsetHeight) + 'px'
      track.style.transform = 'none'
    }
    for (const [index, slide] of slides.entries()) {
      const slideSize = this.#sizes?.[index] ?? size
      Object.assign(slide.style, {
        position: 'absolute', top: '0', left: '0', width: vertical ? '100%' : slideSize + 'px',
        height: vertical ? slideSize + 'px' : '', transform: '', transition: 'none',
        visibility: index === from || index === to ? 'visible' : 'hidden',
        opacity: index === from ? '1' : '0',
      })
    }
    for (const { element } of this.#copies) element.style.visibility = 'hidden'
  }

  render(progress) {
    if (this.#destroyed) return
    this.#progress = 1 - Math.pow(1 - progress, 3)
    this.#slides[this.#from].style.opacity = String(1 - this.#progress)
    this.#slides[this.#to].style.opacity = String(this.#progress)
  }

  getSlots() {
    return this.#slides.map((element, index) => ({
      element, index, copy: 0, isCopy: false, offset: 0, size: this.#sizes?.[index] ?? this.#size,
      hidden: index !== this.#from && index !== this.#to,
      progress: index === this.#from ? -this.#direction * this.#progress
        : index === this.#to ? this.#direction * (1 - this.#progress) : index - this.#to,
    }))
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#slides.forEach((slide, index) => restoreStyles(slide.style, this.#saved[index]))
    for (const { element, styles } of this.#copies) restoreStyles(element.style, styles)
    if (this.#track) restoreStyles(this.#track.style, this.#trackStyle)
  }
}
