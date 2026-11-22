// @vitest-environment happy-dom
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { BorutoKarmaPortrait } from './BorutoKarmaPortrait'

afterEach(cleanup)

function phase(container: HTMLElement): string | null {
  return container.querySelector('.deck-karma')!.getAttribute('data-karma')
}

function endAnimation(container: HTMLElement, animationName: string): void {
  const node = container.querySelector('.deck-karma')!
  const event = createEvent.animationEnd(node)
  Object.defineProperty(event, 'animationName', { value: animationName })
  fireEvent(node, event)
}

it('rests with no issues and keeps one accessible portrait image', () => {
  const { container } = render(<BorutoKarmaPortrait awake={false} />)
  expect(phase(container)).toBe('rest')
  expect(screen.getAllByRole('img')).toHaveLength(1)
  expect(screen.getByRole('img', { name: 'Boruto Uzumaki' })).toBeTruthy()
})

it('wakes when issues appear, sleeps when they clear, and rests after the retreat ends', () => {
  const { container, rerender } = render(<BorutoKarmaPortrait awake={false} />)
  rerender(<BorutoKarmaPortrait awake />)
  expect(phase(container)).toBe('awake')
  rerender(<BorutoKarmaPortrait awake={false} />)
  expect(phase(container)).toBe('sleeping')
  // An unrelated animation (an overlay fading) must not end the sleep early.
  endAnimation(container, 'deck-karma-fade-out')
  expect(phase(container)).toBe('sleeping')
  endAnimation(container, 'deck-karma-retreat')
  expect(phase(container)).toBe('rest')
})

it('wakes again straight from the middle of a retreat', () => {
  const { container, rerender } = render(<BorutoKarmaPortrait awake />)
  rerender(<BorutoKarmaPortrait awake={false} />)
  rerender(<BorutoKarmaPortrait awake />)
  expect(phase(container)).toBe('awake')
})
