/**
 * Synthetic Slack objects in the shapes the Web API returns (snake_case, numeric unix
 * seconds, string message timestamps). No real workspace data.
 */

export const TEAM = 'T0123456789';
export const CH = 'C0123456789';
export const CH2 = 'C0987654321';
export const DM = 'D0123456789';
export const U = 'U0123456789';
export const U2 = 'U0987654321';
export const FILE_ID = 'F0123456789';
export const TS = '1700000000.000100';
export const TS2 = '1700000050.000200';
/** 1700000000 as ISO. */
export const T0_ISO = '2023-11-14T22:13:20.000Z';

export const RAW_CHANNEL = {
  id: CH,
  name: 'general',
  is_channel: true,
  is_group: false,
  is_im: false,
  is_mpim: false,
  is_private: false,
  created: 1700000000,
  is_archived: false,
  is_general: true,
  unlinked: 0,
  name_normalized: 'general',
  is_shared: false,
  is_org_shared: false,
  is_ext_shared: false,
  is_member: true,
  creator: U,
  topic: { value: 'Company news', creator: U, last_set: 1700000000 },
  purpose: { value: 'Announcements', creator: U, last_set: 1700000000 },
  previous_names: [],
  num_members: 12,
};

/** `extractChannel(RAW_CHANNEL)`: what the channel tools return. */
export const CURATED_CHANNEL = {
  id: CH,
  name: 'general',
  isPrivate: false,
  isArchived: false,
  isMember: true,
  numMembers: 12,
  topic: 'Company news',
  purpose: 'Announcements',
  created: T0_ISO,
  creator: U,
  isGeneral: true,
  isShared: false,
  isOrgShared: false,
  isExtShared: false,
  unlinked: 0,
  nameNormalized: 'general',
  previousNames: [],
};

export const RAW_MESSAGE = {
  type: 'message',
  user: U,
  text: 'hello',
  ts: TS,
  team: TEAM,
  client_msg_id: '0d3f2c1a-synthetic',
  reactions: [{ name: 'tada', users: [U2], count: 1 }],
};

/** `extractMessage(RAW_MESSAGE, { channel: CH })`. */
export const CURATED_MESSAGE = {
  ts: TS,
  channel: CH,
  user: U,
  userName: null,
  text: 'hello',
  subtype: null,
  threadTs: null,
  replyCount: 0,
  reactions: [{ name: 'tada', count: 1, users: [U2] }],
  permalink: null,
  createdAt: T0_ISO,
  edited: null,
  parentUserId: null,
};

export const RAW_USER = {
  id: U,
  team_id: TEAM,
  name: 'ada',
  deleted: false,
  real_name: 'Ada Example',
  tz: 'Europe/Madrid',
  tz_label: 'Central European Time',
  tz_offset: 3600,
  profile: {
    title: 'Engineer',
    phone: '',
    real_name: 'Ada Example',
    display_name: 'ada',
    status_text: '',
    status_emoji: '',
    email: 'ada@example.com',
    image_48: 'https://avatars.example.com/ada_48.png',
    image_192: 'https://avatars.example.com/ada_192.png',
  },
  is_admin: true,
  is_owner: false,
  is_restricted: false,
  is_ultra_restricted: false,
  is_bot: false,
  updated: 1700000000,
};

export const RAW_FILE = {
  id: FILE_ID,
  created: 1700000000,
  name: 'report.pdf',
  title: 'Report',
  mimetype: 'application/pdf',
  filetype: 'pdf',
  pretty_type: 'PDF',
  user: U,
  size: 2048,
  url_private: 'https://files.slack.com/files-pri/T0123456789-F0123456789/report.pdf',
  permalink: 'https://example.slack.com/files/U0123456789/F0123456789/report.pdf',
  thumb_360: 'https://files.slack.com/files-tmb/T0123456789-F0123456789/report_360.png',
  channels: [CH],
  is_public: true,
};

/** `extractFile(RAW_FILE)`. */
export const CURATED_FILE = {
  id: FILE_ID,
  name: 'report.pdf',
  title: 'Report',
  mimetype: 'application/pdf',
  fileType: 'pdf',
  prettyType: 'PDF',
  size: 2048,
  user: U,
  userName: null,
  urlPrivate: RAW_FILE.url_private,
  permalink: RAW_FILE.permalink,
  thumbUrl: RAW_FILE.thumb_360,
  channels: [CH],
  isPublic: true,
  createdAt: T0_ISO,
};

export const RAW_BOOKMARK = {
  id: 'Bk0123456789',
  channel_id: CH,
  title: 'Runbook',
  link: 'https://example.com/runbook',
  emoji: ':notebook:',
  icon_url: null,
  type: 'link',
  entity_id: null,
  date_created: 1700000000,
  date_updated: 0,
  rank: 'U',
  last_updated_by_user_id: U,
  last_updated_by_team_id: TEAM,
  shortcut_id: null,
  app_id: null,
};

export const CURATED_BOOKMARK = {
  id: 'Bk0123456789',
  channelId: CH,
  title: 'Runbook',
  link: 'https://example.com/runbook',
  emoji: ':notebook:',
  type: 'link',
  dateCreated: T0_ISO,
  dateUpdated: '1970-01-01T00:00:00.000Z',
  rank: 'U',
};

export const RAW_REMOTE_FILE = {
  id: FILE_ID,
  created: 1700000000,
  name: 'Design doc',
  title: 'Design doc',
  filetype: 'gdoc',
  user: U,
  external_type: 'app',
  is_external: true,
  external_id: 'doc-42',
  external_url: 'https://docs.example.com/d/42',
  permalink: 'https://example.slack.com/files/U0123456789/F0123456789/design_doc',
  channels: [],
};

export const CURATED_REMOTE_FILE = {
  id: FILE_ID,
  externalId: 'doc-42',
  externalUrl: 'https://docs.example.com/d/42',
  title: 'Design doc',
  fileType: 'gdoc',
  size: null,
  user: U,
  createdAt: T0_ISO,
  permalink: RAW_REMOTE_FILE.permalink,
  channels: [],
};

export const RAW_CALL = {
  id: 'R0123456789',
  date_start: 1700000000,
  external_unique_id: 'meet-42',
  join_url: 'https://meet.example.com/42',
  desktop_app_join_url: 'meetapp://42',
  external_display_id: '42',
  title: 'Standup',
  users: [{ slack_id: U }, { external_id: 'ext-1', display_name: 'Guest' }],
};

export const CURATED_CALL = {
  id: 'R0123456789',
  externalUniqueId: 'meet-42',
  joinUrl: 'https://meet.example.com/42',
  desktopAppJoinUrl: 'meetapp://42',
  title: 'Standup',
  dateStart: T0_ISO,
  dateEnd: null,
  status: 'active',
  participants: [
    { slackId: U, externalId: null, displayName: null, avatarUrl: null },
    { slackId: null, externalId: 'ext-1', displayName: 'Guest', avatarUrl: null },
  ],
};
