import { describe, expect, it, vi } from 'vitest'

import {
  requestRecommendCompute,
  subscribeRecommendCompute,
} from '@/components/interfaces/Settings/Infrastructure/ReadReplicas/recommendCompute'

describe('recommendCompute bridge', () => {
  it('delivers the recommended size to the active subscriber', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRecommendCompute(listener)

    requestRecommendCompute('ci_small')
    expect(listener).toHaveBeenCalledWith('ci_small')

    unsubscribe()
    requestRecommendCompute('ci_xlarge')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('replaces the previous subscriber', () => {
    const first = vi.fn()
    const second = vi.fn()

    subscribeRecommendCompute(first)
    subscribeRecommendCompute(second)

    requestRecommendCompute('ci_xlarge')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('ci_xlarge')
  })
})
