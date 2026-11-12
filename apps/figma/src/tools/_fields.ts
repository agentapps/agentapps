/**
 * Field whitelists for curated tool responses.
 */

export const FILE_FIELDS = [
  'name',
  'lastModified',
  'version',
  'thumbnailUrl',
  'document',
  'componentCount',
  'styleCount',
  'role',
  'editorType',
] as const;

export const NODE_FIELDS = [
  'id',
  'name',
  'type',
  'fills',
  'strokes',
  'strokeWeight',
  'cornerRadius',
  'textStyle',
  'bounds',
  'componentId',
  'componentSetId',
  'children',
  'childCount',
] as const;

export const COMPONENT_FIELDS = ['id', 'key', 'name', 'description', 'componentSetId'] as const;

export const COMPONENT_SET_FIELDS = ['id', 'key', 'name', 'description'] as const;

export const STYLE_FIELDS = ['id', 'key', 'name', 'type', 'description'] as const;

export const VARIABLE_FIELDS = ['id', 'name', 'type', 'values', 'description'] as const;

export const VARIABLE_COLLECTION_FIELDS = [
  'id',
  'name',
  'modes',
  'variables',
  'defaultModeId',
] as const;

export const COMMENT_FIELDS = [
  'id',
  'message',
  'createdAt',
  'user',
  'resolved',
  'parentId',
  'clientMeta',
] as const;

export const VERSION_FIELDS = [
  'id',
  'createdAt',
  'label',
  'description',
  'user',
  'thumbnailUrl',
] as const;

export const EXPORTED_IMAGE_FIELDS = ['nodeId', 'url', 'format', 'scale'] as const;

export type FieldList = readonly string[];
