/**
 * Mapping of tools → required GitHub App permissions.
 */

export type GitHubAppPermissionLevel = 'read' | 'write';

export type GitHubAppPermissionKey =
  | 'contents'
  | 'issues'
  | 'pull_requests'
  | 'metadata'
  | 'workflows'
  | 'actions'
  | 'members'
  | 'administration'
  | 'checks'
  | 'statuses'
  | 'rate_limit';

export type ToolPermissions = Partial<Record<GitHubAppPermissionKey, GitHubAppPermissionLevel>>;

export const TOOL_PERMISSIONS: Record<string, ToolPermissions> = {
  'list-repos': { metadata: 'read' },
  'get-repo': { metadata: 'read' },
  'create-repo': { administration: 'write' },
  'search-repos': { metadata: 'read' },
  'list-issues': { issues: 'read' },
  'get-issue': { issues: 'read' },
  'create-issue': { issues: 'write' },
  'update-issue': { issues: 'write' },
  'add-issue-comment': { issues: 'write' },
  'add-labels-to-issue': { issues: 'write' },
  'search-issues': { issues: 'read' },
  'list-pulls': { pull_requests: 'read' },
  'get-pull': { pull_requests: 'read' },
  'create-pull': { pull_requests: 'write', contents: 'read' },
  'merge-pull': { pull_requests: 'write', contents: 'write' },
  'list-pr-files': { pull_requests: 'read' },
  'list-pr-commits': { pull_requests: 'read' },
  'list-pr-review-comments': { pull_requests: 'read' },
  'request-reviewers': { pull_requests: 'write' },
  'create-pr-review': { pull_requests: 'write' },
  'list-branches': { contents: 'read' },
  'get-branch': { contents: 'read' },
  'create-branch': { contents: 'write' },
  'list-commits': { contents: 'read' },
  'get-commit': { contents: 'read' },
  'compare-commits': { contents: 'read' },
  'list-workflows': { actions: 'read' },
  'list-workflow-runs': { actions: 'read' },
  'get-workflow-run': { actions: 'read' },
  'list-workflow-run-jobs': { actions: 'read' },
  'trigger-workflow': { actions: 'write', contents: 'read' },
  'rerun-workflow-run': { actions: 'write' },
  'cancel-workflow-run': { actions: 'write' },
  'list-releases': { contents: 'read' },
  'create-release': { contents: 'write' },
  'get-file-content': { contents: 'read' },
  'create-or-update-file': { contents: 'write' },
  'search-code': { metadata: 'read' },
  'get-installation-context': { metadata: 'read' },
  'clone-repo': { contents: 'read' },
  'create-check-run': { checks: 'write' },
  'update-check-run': { checks: 'write' },
  'get-rate-limit': { metadata: 'read' },
  'dispatch-event': { contents: 'write' },
};

export function aggregateRequiredPermissions(): Record<
  GitHubAppPermissionKey,
  GitHubAppPermissionLevel
> {
  const out: Partial<Record<GitHubAppPermissionKey, GitHubAppPermissionLevel>> = {};
  for (const tool of Object.values(TOOL_PERMISSIONS)) {
    for (const [k, v] of Object.entries(tool) as Array<
      [GitHubAppPermissionKey, GitHubAppPermissionLevel]
    >) {
      if (out[k] === 'write' || v === 'write') {
        out[k] = 'write';
      } else {
        out[k] = 'read';
      }
    }
  }
  return out as Record<GitHubAppPermissionKey, GitHubAppPermissionLevel>;
}

export function getRequiredPermissions(toolName: string): ToolPermissions | null {
  return TOOL_PERMISSIONS[toolName] ?? null;
}
