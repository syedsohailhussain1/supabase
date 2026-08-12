export type GitHubConfigFormat = 'json' | 'toml'

export interface GitHubConfigSource {
  repository: string
  branch: string
  path: string
  format: GitHubConfigFormat
  sha: string
  htmlUrl: string | null
}

export interface GitHubConfigResponse {
  source: GitHubConfigSource
  config: Record<string, unknown>
  managedPaths: string[]
  /**
   * The config re-serialized for display in the TOML viewer. The Management API only
   * returns the parsed config, not the source file's original bytes, so this is not
   * necessarily byte-identical to what's in the repository (comments/formatting may differ).
   */
  originalContent?: string
}
