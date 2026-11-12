/**
 * Field whitelists for curated tool responses.
 */

export const ISSUE_COMPACT_FIELDS = [
  'id',
  'identifier',
  'title',
  'url',
  'status',
  'priority',
  'assignee',
  'team',
  'createdAt',
  'updatedAt',
] as const;

export const ISSUE_DETAIL_FIELDS = [
  ...ISSUE_COMPACT_FIELDS,
  'description',
  'labels',
  'project',
  'cycle',
  'parentId',
  'dueDate',
  'estimate',
  'archivedAt',
] as const;

export const PROJECT_COMPACT_FIELDS = [
  'id',
  'name',
  'url',
  'state',
  'icon',
  'color',
  'progress',
  'startDate',
  'targetDate',
  'createdAt',
  'updatedAt',
] as const;

export const PROJECT_DETAIL_FIELDS = [
  ...PROJECT_COMPACT_FIELDS,
  'description',
  'lead',
  'teams',
] as const;

export const USER_FIELDS = [
  'id',
  'name',
  'displayName',
  'email',
  'avatarUrl',
  'active',
  'admin',
] as const;

export const TEAM_FIELDS = [
  'id',
  'name',
  'key',
  'icon',
  'color',
  'description',
  'private',
] as const;

export const LABEL_FIELDS = ['id', 'name', 'color', 'description', 'isGroup', 'parentId'] as const;

export const WORKFLOW_STATE_FIELDS = [
  'id',
  'name',
  'type',
  'color',
  'position',
  'description',
] as const;

export const CYCLE_FIELDS = [
  'id',
  'name',
  'number',
  'startsAt',
  'endsAt',
  'progress',
  'description',
] as const;

export const COMMENT_FIELDS = [
  'id',
  'body',
  'authorId',
  'authorName',
  'issueId',
  'url',
  'createdAt',
  'updatedAt',
] as const;

export type FieldList = readonly string[];
