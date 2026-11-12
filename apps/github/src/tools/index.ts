import type { AgentApp } from '@agentapps/sdk';
import { registerAddIssueCommentTool } from './add-issue-comment.js';
import { registerAddLabelsToIssueTool } from './add-labels-to-issue.js';
import { registerCancelWorkflowRunTool } from './cancel-workflow-run.js';
// Clone
import { registerCloneRepoTool } from './clone-repo.js';
import { registerCompareCommitsTool } from './compare-commits.js';
import { registerCreateBranchTool } from './create-branch.js';
// Check Runs
import { registerCreateCheckRunTool } from './create-check-run.js';
import { registerCreateIssueTool } from './create-issue.js';
import { registerCreateOrUpdateFileTool } from './create-or-update-file.js';
import { registerCreatePrReviewTool } from './create-pr-review.js';
import { registerCreatePullTool } from './create-pull.js';
import { registerCreateReleaseTool } from './create-release.js';
import { registerCreateRepoTool } from './create-repo.js';
import { registerDispatchEventTool } from './dispatch-event.js';
import { registerGetBranchTool } from './get-branch.js';
import { registerGetCommitTool } from './get-commit.js';
// File Contents
import { registerGetFileContentTool } from './get-file-content.js';
// Installation Context
import {
  registerGetInstallationContextTool,
  registerGetUserTool,
} from './get-installation-context.js';
import { registerGetIssueTool } from './get-issue.js';
import { registerGetPullTool } from './get-pull.js';
// Misc
import { registerGetRateLimitTool } from './get-rate-limit.js';
import { registerGetRepoTool } from './get-repo.js';
import { registerGetWorkflowRunTool } from './get-workflow-run.js';
import { registerGitAddTool } from './git-add.js';
import { registerGitBatchCommitTool } from './git-batch-commit.js';
import { registerGitBisectTool } from './git-bisect.js';
// Local git — P3 debugging
import { registerGitBlameTool } from './git-blame.js';
import { registerGitCheckoutTool } from './git-checkout.js';
import { registerGitCherryPickTool } from './git-cherry-pick.js';
import { registerGitCommitTool } from './git-commit.js';
// Local git — P2 configuration
import { registerGitConfigTool } from './git-config.js';
import { registerGitDiffTool } from './git-diff.js';
// Local git — extra
import { registerGitFetchTool } from './git-fetch.js';
import { registerGitListFilesTool } from './git-list-files.js';
import { registerGitLogTool } from './git-log.js';
import { registerGitMergeTool } from './git-merge.js';
import { registerGitMvTool } from './git-mv.js';
import { registerGitPullTool } from './git-pull.js';
import { registerGitPushTool } from './git-push.js';
import { registerGitReadFileTool } from './git-read-file.js';
import { registerGitRebaseTool } from './git-rebase.js';
import { registerGitRemoteTool } from './git-remote.js';
import { registerGitResetTool } from './git-reset.js';
// Local git — P1 file ops, sync, diff/log, batch
import { registerGitRmTool } from './git-rm.js';
// Local git — P2 history rewriting
import { registerGitStashTool } from './git-stash.js';
// Local git — P0 core
import { registerGitStatusTool } from './git-status.js';
import { registerGitTagTool } from './git-tag.js';
import { registerGitWriteFileTool } from './git-write-file.js';
// Branches
import { registerListBranchesTool } from './list-branches.js';
// Commits
import { registerListCommitsTool } from './list-commits.js';
// Issues
import { registerListIssuesTool } from './list-issues.js';
import { registerListPrCommitsTool } from './list-pr-commits.js';
import { registerListPrFilesTool } from './list-pr-files.js';
import { registerListPrReviewCommentsTool } from './list-pr-review-comments.js';
// Pull Requests
import { registerListPullsTool } from './list-pulls.js';
// Releases
import { registerListReleasesTool } from './list-releases.js';
// Repos
import { registerListReposTool } from './list-repos.js';
import { registerListWorkflowRunJobsTool } from './list-workflow-run-jobs.js';
import { registerListWorkflowRunsTool } from './list-workflow-runs.js';
// Actions / Workflows
import { registerListWorkflowsTool } from './list-workflows.js';
import { registerMergePullTool } from './merge-pull.js';
import { registerRequestReviewersTool } from './request-reviewers.js';
import { registerRerunWorkflowRunTool } from './rerun-workflow-run.js';
// Search
import { registerSearchCodeTool } from './search-code.js';
import { registerSearchIssuesTool } from './search-issues.js';
import { registerSearchReposTool } from './search-repos.js';
import { registerTriggerWorkflowTool } from './trigger-workflow.js';
import { registerUpdateCheckRunTool } from './update-check-run.js';
import { registerUpdateIssueTool } from './update-issue.js';

/**
 * Register all 71 GitHub tools on the given app instance.
 */
export function registerTools(app: AgentApp): void {
  // Repos
  registerListReposTool(app);
  registerGetRepoTool(app);
  registerCreateRepoTool(app);
  registerSearchReposTool(app);

  // Issues
  registerListIssuesTool(app);
  registerGetIssueTool(app);
  registerCreateIssueTool(app);
  registerUpdateIssueTool(app);
  registerAddIssueCommentTool(app);
  registerAddLabelsToIssueTool(app);
  registerSearchIssuesTool(app);

  // Pull Requests
  registerListPullsTool(app);
  registerGetPullTool(app);
  registerCreatePullTool(app);
  registerMergePullTool(app);
  registerListPrFilesTool(app);
  registerListPrCommitsTool(app);
  registerListPrReviewCommentsTool(app);
  registerRequestReviewersTool(app);
  registerCreatePrReviewTool(app);

  // Branches
  registerListBranchesTool(app);
  registerGetBranchTool(app);
  registerCreateBranchTool(app);

  // Commits
  registerListCommitsTool(app);
  registerGetCommitTool(app);
  registerCompareCommitsTool(app);

  // Actions / Workflows
  registerListWorkflowsTool(app);
  registerListWorkflowRunsTool(app);
  registerGetWorkflowRunTool(app);
  registerListWorkflowRunJobsTool(app);
  registerTriggerWorkflowTool(app);
  registerRerunWorkflowRunTool(app);
  registerCancelWorkflowRunTool(app);

  // Releases
  registerListReleasesTool(app);
  registerCreateReleaseTool(app);

  // File Contents
  registerGetFileContentTool(app);
  registerCreateOrUpdateFileTool(app);

  // Search
  registerSearchCodeTool(app);

  // Installation Context
  registerGetInstallationContextTool(app);
  registerGetUserTool(app);

  // Check Runs
  registerCreateCheckRunTool(app);
  registerUpdateCheckRunTool(app);

  // Misc
  registerGetRateLimitTool(app);
  registerDispatchEventTool(app);

  // Clone
  registerCloneRepoTool(app);

  // Local git — P0 core
  registerGitStatusTool(app);
  registerGitAddTool(app);
  registerGitCommitTool(app);
  registerGitPushTool(app);
  registerGitCheckoutTool(app);

  // Local git — P1
  registerGitRmTool(app);
  registerGitMvTool(app);
  registerGitReadFileTool(app);
  registerGitWriteFileTool(app);
  registerGitListFilesTool(app);
  registerGitPullTool(app);
  registerGitDiffTool(app);
  registerGitLogTool(app);
  registerGitBatchCommitTool(app);

  // Local git — P2 history
  registerGitStashTool(app);
  registerGitMergeTool(app);
  registerGitRebaseTool(app);
  registerGitResetTool(app);
  registerGitCherryPickTool(app);

  // Local git — P2 config
  registerGitConfigTool(app);
  registerGitTagTool(app);
  registerGitRemoteTool(app);

  // Local git — P3 debugging
  registerGitBlameTool(app);
  registerGitBisectTool(app);

  // Local git — extra
  registerGitFetchTool(app);
}
