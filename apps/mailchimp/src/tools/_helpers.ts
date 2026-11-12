/**
 * Pure boundary validation, response shaping, and argument coercion for
 * the Mailchimp tools.
 *
 * Everything here is side-effect free and SDK-free so it can be unit-tested
 * directly. The tool handlers are thin wrappers: validate -> mailchimpRequest -> shape.
 */

// ============================================================================
// Primitive guards
// ============================================================================

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): value is string {
  return isNonEmptyString(value) && EMAIL_RE.test(value.trim());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// ============================================================================
// Coercion
// ============================================================================

/**
 * Coerce an arg to an integer clamped to [min, max]. Missing / non-numeric ->
 * `fallback`. Floats are floored.
 */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

// ============================================================================
// Response shaping — audiences (lists)
// ============================================================================

export interface ShapedAudience {
  id: string | null;
  name: string | null;
  contact: Record<string, unknown> | null;
  permission_reminder: string | null;
  campaign_defaults: Record<string, unknown> | null;
  stats: Record<string, unknown> | null;
  date_created: string | null;
  list_rating: number | null;
  member_count: number | null;
}

export function shapeAudience(raw: unknown): ShapedAudience {
  const a = isPlainObject(raw) ? raw : {};
  return {
    id: typeof a.id === 'string' ? a.id : null,
    name: typeof a.name === 'string' ? a.name : null,
    contact: isPlainObject(a.contact) ? a.contact : null,
    permission_reminder: typeof a.permission_reminder === 'string' ? a.permission_reminder : null,
    campaign_defaults: isPlainObject(a.campaign_defaults) ? a.campaign_defaults : null,
    stats: isPlainObject(a.stats) ? a.stats : null,
    date_created: typeof a.date_created === 'string' ? a.date_created : null,
    list_rating: typeof a.list_rating === 'number' ? a.list_rating : null,
    member_count:
      typeof a.member_count === 'number'
        ? a.member_count
        : isPlainObject(a.stats) && typeof a.stats.member_count === 'number'
          ? a.stats.member_count
          : null,
  };
}

// ============================================================================
// Response shaping — subscribers (members)
// ============================================================================

export interface ShapedSubscriber {
  id: string | null;
  email_address: string | null;
  unique_email_id: string | null;
  status: string | null;
  merge_fields: Record<string, unknown> | null;
  list_id: string | null;
  timestamp_signup: string | null;
  last_changed: string | null;
}

export function shapeSubscriber(raw: unknown): ShapedSubscriber {
  const s = isPlainObject(raw) ? raw : {};
  return {
    id: typeof s.id === 'string' ? s.id : null,
    email_address: typeof s.email_address === 'string' ? s.email_address : null,
    unique_email_id: typeof s.unique_email_id === 'string' ? s.unique_email_id : null,
    status: typeof s.status === 'string' ? s.status : null,
    merge_fields: isPlainObject(s.merge_fields) ? s.merge_fields : null,
    list_id: typeof s.list_id === 'string' ? s.list_id : null,
    timestamp_signup: typeof s.timestamp_signup === 'string' ? s.timestamp_signup : null,
    last_changed: typeof s.last_changed === 'string' ? s.last_changed : null,
  };
}

// ============================================================================
// Response shaping — campaigns
// ============================================================================

export interface ShapedCampaign {
  id: string | null;
  type: string | null;
  status: string | null;
  emails_sent: number | null;
  send_time: string | null;
  content_type: string | null;
  recipients: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  create_time: string | null;
}

export function shapeCampaign(raw: unknown): ShapedCampaign {
  const c = isPlainObject(raw) ? raw : {};
  return {
    id: typeof c.id === 'string' ? c.id : null,
    type: typeof c.type === 'string' ? c.type : null,
    status: typeof c.status === 'string' ? c.status : null,
    emails_sent: typeof c.emails_sent === 'number' ? c.emails_sent : null,
    send_time: typeof c.send_time === 'string' ? c.send_time : null,
    content_type: typeof c.content_type === 'string' ? c.content_type : null,
    recipients: isPlainObject(c.recipients) ? c.recipients : null,
    settings: isPlainObject(c.settings) ? c.settings : null,
    create_time: typeof c.create_time === 'string' ? c.create_time : null,
  };
}

// ============================================================================
// Response shaping — templates
// ============================================================================

export interface ShapedTemplate {
  id: number | null;
  type: string | null;
  name: string | null;
  drag_and_drop: boolean | null;
  responsive: boolean | null;
  category: string | null;
  date_created: string | null;
  date_edited: string | null;
  active: boolean | null;
  folder_id: string | null;
}

export function shapeTemplate(raw: unknown): ShapedTemplate {
  const t = isPlainObject(raw) ? raw : {};
  return {
    id: typeof t.id === 'number' ? t.id : null,
    type: typeof t.type === 'string' ? t.type : null,
    name: typeof t.name === 'string' ? t.name : null,
    drag_and_drop: typeof t.drag_and_drop === 'boolean' ? t.drag_and_drop : null,
    responsive: typeof t.responsive === 'boolean' ? t.responsive : null,
    category: typeof t.category === 'string' ? t.category : null,
    date_created: typeof t.date_created === 'string' ? t.date_created : null,
    date_edited: typeof t.date_edited === 'string' ? t.date_edited : null,
    active: typeof t.active === 'boolean' ? t.active : null,
    folder_id: typeof t.folder_id === 'string' ? t.folder_id : null,
  };
}

// ============================================================================
// Validation — add-subscriber
// ============================================================================

const SUBSCRIBER_STATUSES = [
  'subscribed',
  'unsubscribed',
  'cleaned',
  'pending',
  'transactional',
] as const;

export function validateAddSubscriberArgs(args: unknown): void {
  if (!isPlainObject(args)) throw new Error('Invalid arguments: expected an object.');
  if (!isNonEmptyString(args.listId)) {
    throw new Error('listId is required and must be a non-empty string.');
  }
  if (!isNonEmptyString(args.email_address)) {
    throw new Error('email_address is required and must be a non-empty email address.');
  }
  if (!isValidEmail(args.email_address)) {
    throw new Error(`email_address is not a valid email address: "${args.email_address}".`);
  }
  if (args.status !== undefined) {
    if (
      typeof args.status !== 'string' ||
      !SUBSCRIBER_STATUSES.includes(args.status as (typeof SUBSCRIBER_STATUSES)[number])
    ) {
      throw new Error(`status must be one of: ${SUBSCRIBER_STATUSES.join(', ')}.`);
    }
  }
  if (args.merge_fields !== undefined && !isPlainObject(args.merge_fields)) {
    throw new Error('merge_fields must be an object (e.g. { FNAME: "John", LNAME: "Doe" }).');
  }
}

export interface AddSubscriberBody {
  email_address: string;
  status: string;
  merge_fields?: Record<string, unknown>;
}

export function buildAddSubscriberBody(args: Record<string, unknown>): AddSubscriberBody {
  const body: AddSubscriberBody = {
    email_address: String(args.email_address).trim(),
    status: isNonEmptyString(args.status) ? args.status : 'subscribed',
  };
  if (isPlainObject(args.merge_fields)) body.merge_fields = args.merge_fields;
  return body;
}

// ============================================================================
// Validation — update-subscriber
// ============================================================================

const UPDATE_SUBSCRIBER_STATUSES = [
  'subscribed',
  'unsubscribed',
  'cleaned',
  'pending',
  'transactional',
] as const;

export function validateUpdateSubscriberArgs(args: unknown): void {
  if (!isPlainObject(args)) throw new Error('Invalid arguments: expected an object.');
  if (!isNonEmptyString(args.listId)) {
    throw new Error('listId is required and must be a non-empty string.');
  }
  if (!isNonEmptyString(args.subscriberHash)) {
    throw new Error(
      'subscriberHash is required and must be a non-empty string (MD5 hash of the subscriber email in lowercase).',
    );
  }
  if (args.status !== undefined) {
    if (
      typeof args.status !== 'string' ||
      !UPDATE_SUBSCRIBER_STATUSES.includes(
        args.status as (typeof UPDATE_SUBSCRIBER_STATUSES)[number],
      )
    ) {
      throw new Error(`status must be one of: ${UPDATE_SUBSCRIBER_STATUSES.join(', ')}.`);
    }
  }
  if (args.merge_fields !== undefined && !isPlainObject(args.merge_fields)) {
    throw new Error('merge_fields must be an object (e.g. { FNAME: "John", LNAME: "Doe" }).');
  }
  if (args.email_address !== undefined && !isValidEmail(args.email_address)) {
    throw new Error(`email_address is not a valid email address: "${args.email_address}".`);
  }
}

export interface UpdateSubscriberBody {
  email_address?: string;
  status?: string;
  merge_fields?: Record<string, unknown>;
}

export function buildUpdateSubscriberBody(args: Record<string, unknown>): UpdateSubscriberBody {
  const body: UpdateSubscriberBody = {};
  if (isValidEmail(args.email_address)) body.email_address = String(args.email_address).trim();
  if (isNonEmptyString(args.status)) body.status = args.status;
  if (isPlainObject(args.merge_fields)) body.merge_fields = args.merge_fields;
  return body;
}

// ============================================================================
// Response shaping — campaign reports
// ============================================================================

export interface ShapedCampaignReport {
  id: string | null;
  campaign_title: string | null;
  type: string | null;
  list_id: string | null;
  list_name: string | null;
  subject_line: string | null;
  emails_sent: number | null;
  abuse_reports: number | null;
  unsubscribed: number | null;
  send_time: string | null;
  opens: Record<string, unknown> | null;
  clicks: Record<string, unknown> | null;
  bounces: Record<string, unknown> | null;
}

export function shapeCampaignReport(raw: unknown): ShapedCampaignReport {
  const r = isPlainObject(raw) ? raw : {};
  return {
    id: typeof r.id === 'string' ? r.id : null,
    campaign_title: typeof r.campaign_title === 'string' ? r.campaign_title : null,
    type: typeof r.type === 'string' ? r.type : null,
    list_id: typeof r.list_id === 'string' ? r.list_id : null,
    list_name: typeof r.list_name === 'string' ? r.list_name : null,
    subject_line: typeof r.subject_line === 'string' ? r.subject_line : null,
    emails_sent: typeof r.emails_sent === 'number' ? r.emails_sent : null,
    abuse_reports: typeof r.abuse_reports === 'number' ? r.abuse_reports : null,
    unsubscribed: typeof r.unsubscribed === 'number' ? r.unsubscribed : null,
    send_time: typeof r.send_time === 'string' ? r.send_time : null,
    opens: isPlainObject(r.opens) ? r.opens : null,
    clicks: isPlainObject(r.clicks) ? r.clicks : null,
    bounces: isPlainObject(r.bounces) ? r.bounces : null,
  };
}

// ============================================================================
// Response shaping — segments
// ============================================================================

export interface ShapedSegment {
  id: number | null;
  name: string | null;
  member_count: number | null;
  type: string | null;
  created_at: string | null;
  updated_at: string | null;
  list_id: string | null;
}

export function shapeSegment(raw: unknown): ShapedSegment {
  const s = isPlainObject(raw) ? raw : {};
  return {
    id: typeof s.id === 'number' ? s.id : null,
    name: typeof s.name === 'string' ? s.name : null,
    member_count: typeof s.member_count === 'number' ? s.member_count : null,
    type: typeof s.type === 'string' ? s.type : null,
    created_at: typeof s.created_at === 'string' ? s.created_at : null,
    updated_at: typeof s.updated_at === 'string' ? s.updated_at : null,
    list_id: typeof s.list_id === 'string' ? s.list_id : null,
  };
}

// ============================================================================
// Validation — create-segment
// ============================================================================

export function validateCreateSegmentArgs(args: unknown): void {
  if (!isPlainObject(args)) throw new Error('Invalid arguments: expected an object.');
  if (!isNonEmptyString(args.listId)) {
    throw new Error('listId is required and must be a non-empty string.');
  }
  if (!isNonEmptyString(args.name)) {
    throw new Error('name is required and must be a non-empty string.');
  }
  if (args.static_segment !== undefined && !Array.isArray(args.static_segment)) {
    throw new Error('static_segment must be an array of email addresses.');
  }
  if (args.conditions !== undefined && !isPlainObject(args.conditions)) {
    throw new Error('conditions must be an object with { match, conditions[] }.');
  }
}

export interface CreateSegmentBody {
  name: string;
  static_segment?: string[];
  options?: Record<string, unknown>;
}

export function buildCreateSegmentBody(args: Record<string, unknown>): CreateSegmentBody {
  const body: CreateSegmentBody = {
    name: String(args.name).trim(),
  };
  if (Array.isArray(args.static_segment)) {
    body.static_segment = args.static_segment.map(String);
  }
  if (isPlainObject(args.conditions)) {
    body.options = args.conditions as Record<string, unknown>;
  }
  return body;
}

// ============================================================================
// Response shaping — tags
// ============================================================================

export interface ShapedTag {
  id: number | null;
  name: string | null;
}

export function shapeTag(raw: unknown): ShapedTag {
  const t = isPlainObject(raw) ? raw : {};
  return {
    id: typeof t.id === 'number' ? t.id : null,
    name: typeof t.name === 'string' ? t.name : null,
  };
}

// ============================================================================
// Response shaping — merge fields
// ============================================================================

export interface ShapedMergeField {
  merge_id: number | null;
  tag: string | null;
  name: string | null;
  type: string | null;
  required: boolean | null;
  default_value: string | null;
  public: boolean | null;
  list_id: string | null;
}

export function shapeMergeField(raw: unknown): ShapedMergeField {
  const m = isPlainObject(raw) ? raw : {};
  return {
    merge_id: typeof m.merge_id === 'number' ? m.merge_id : null,
    tag: typeof m.tag === 'string' ? m.tag : null,
    name: typeof m.name === 'string' ? m.name : null,
    type: typeof m.type === 'string' ? m.type : null,
    required: typeof m.required === 'boolean' ? m.required : null,
    default_value: typeof m.default_value === 'string' ? m.default_value : null,
    public: typeof m.public === 'boolean' ? m.public : null,
    list_id: typeof m.list_id === 'string' ? m.list_id : null,
  };
}

// ============================================================================
// Response shaping — automations
// ============================================================================

export interface ShapedAutomation {
  id: string | null;
  create_time: string | null;
  start_time: string | null;
  status: string | null;
  emails_sent: number | null;
  recipients: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  trigger_settings: Record<string, unknown> | null;
}

export function shapeAutomation(raw: unknown): ShapedAutomation {
  const a = isPlainObject(raw) ? raw : {};
  return {
    id: typeof a.id === 'string' ? a.id : null,
    create_time: typeof a.create_time === 'string' ? a.create_time : null,
    start_time: typeof a.start_time === 'string' ? a.start_time : null,
    status: typeof a.status === 'string' ? a.status : null,
    emails_sent: typeof a.emails_sent === 'number' ? a.emails_sent : null,
    recipients: isPlainObject(a.recipients) ? a.recipients : null,
    settings: isPlainObject(a.settings) ? a.settings : null,
    trigger_settings: isPlainObject(a.trigger_settings) ? a.trigger_settings : null,
  };
}

// ============================================================================
// Validation — create-campaign
// ============================================================================

export function validateCreateCampaignArgs(args: unknown): void {
  if (!isPlainObject(args)) throw new Error('Invalid arguments: expected an object.');
  if (!isNonEmptyString(args.type)) {
    throw new Error('type is required (e.g. "regular", "plaintext", "absplit", "rss", "variate").');
  }
  if (args.recipients !== undefined && !isPlainObject(args.recipients)) {
    throw new Error('recipients must be an object with { list_id }.');
  }
  if (isPlainObject(args.recipients) && !isNonEmptyString(args.recipients.list_id)) {
    throw new Error('recipients.list_id is required when recipients is provided.');
  }
  if (args.settings !== undefined && !isPlainObject(args.settings)) {
    throw new Error(
      'settings must be an object with campaign settings (subject_line, from_name, reply_to).',
    );
  }
}

export interface CreateCampaignBody {
  type: string;
  recipients?: { list_id: string };
  settings?: Record<string, unknown>;
}

export function buildCreateCampaignBody(args: Record<string, unknown>): CreateCampaignBody {
  const body: CreateCampaignBody = {
    type: String(args.type).trim(),
  };
  if (isPlainObject(args.recipients)) {
    body.recipients = {
      list_id: String((args.recipients as Record<string, unknown>).list_id).trim(),
    };
  }
  if (isPlainObject(args.settings)) {
    body.settings = args.settings as Record<string, unknown>;
  }
  return body;
}
