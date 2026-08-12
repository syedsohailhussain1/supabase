import { describe, expect, it } from 'vitest'

import { isHostedSupportedApiPath } from './hosted-api-allowlist'

describe('hosted API allowlist', () => {
  it('continues to reject unsupported API endpoints', () => {
    expect(isHostedSupportedApiPath('/api/unsupported')).toBe(false)
  })
})
