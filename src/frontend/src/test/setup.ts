
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')
  return {
    default: ({
      children,
      mapStyle,
      onError,
    }: {
      children?: React.ReactNode
      mapStyle?: string
      onError?: (e: unknown) => void
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'mock-maplibre',
          'data-map-style': typeof mapStyle === 'string' ? mapStyle : '',
          onClick: () => undefined,
          'data-has-error-handler': Boolean(onError),
        },
        children,
      ),
    Marker: ({
      children,
      latitude,
      longitude,
    }: {
      children?: React.ReactNode
      latitude: number
      longitude: number
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'mock-maplibre-marker',
          'data-lat': latitude,
          'data-lng': longitude,
        },
        children,
      ),
    NavigationControl: () => React.createElement('div', { 'data-testid': 'mock-maplibre-nav' }),
    Source: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'mock-maplibre-source' }, children),
    Layer: () => React.createElement('div', { 'data-testid': 'mock-maplibre-layer' }),
  }
})

afterEach(() => {
  cleanup()
})
