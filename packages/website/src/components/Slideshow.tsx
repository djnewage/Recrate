import { useEffect, useState } from 'react'

interface SlideshowImage {
  src: string
  alt: string
}

interface SlideshowProps {
  images: SlideshowImage[]
  /** Milliseconds between transitions */
  interval?: number
  className?: string
}

/**
 * Crossfading image slideshow. The first image sits in normal flow to size
 * the container; the rest stack absolutely on top and fade in/out.
 * Auto-advance pauses for users with prefers-reduced-motion.
 */
export default function Slideshow({ images, interval = 2000, className = '' }: SlideshowProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (images.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length)
    }, interval)
    return () => clearInterval(id)
  }, [images.length, interval])

  return (
    <div className={`relative ${className}`}>
      {images.map((img, i) => (
        <img
          key={img.src}
          src={img.src}
          alt={img.alt}
          loading={i === 0 ? 'eager' : 'lazy'}
          className={`w-full h-auto transition-opacity duration-700 ease-in-out ${
            i === 0 ? '' : 'absolute inset-0'
          } ${i === index ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </div>
  )
}
