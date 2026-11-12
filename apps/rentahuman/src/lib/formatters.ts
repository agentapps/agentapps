/**
 * Display formatting helpers for RentAHuman profiles and bookings.
 */

export interface HumanProfile {
  id: string;
  name: string;
  headline?: string;
  bio?: string;
  skills?: string[];
  expertise?: string[];
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  hourlyRate?: number;
  currency?: string;
  availability?: Record<string, unknown>;
  timezone?: string;
  rating?: number;
  reviewCount?: number;
  isAvailable?: boolean;
  isVerified?: boolean;
  isFeatured?: boolean;
  wallets?: Record<string, string>;
}

export interface Booking {
  id: string;
  humanId: string;
  agentId?: string;
  agentName?: string;
  agentType?: string;
  taskTitle: string;
  taskDescription: string;
  taskCategory?: string;
  startTime: string;
  endTime?: string;
  estimatedHours: number;
  totalAmount?: number;
  currency?: string;
  paymentStatus?: string;
  status: string;
}

/**
 * Format a human profile for display.
 */
export function formatHuman(h: HumanProfile): string {
  const lines: string[] = [];

  lines.push(`**${h.name}** (ID: ${h.id})`);

  if (h.headline) lines.push(`_${h.headline}_`);

  const locationParts = [h.location?.city, h.location?.state, h.location?.country].filter(Boolean);
  if (locationParts.length > 0) lines.push(`Location: ${locationParts.join(', ')}`);

  if (h.hourlyRate !== undefined) {
    lines.push(`Rate: ${h.hourlyRate} ${h.currency || 'USD'}/hr`);
  }

  if (h.rating !== undefined) {
    lines.push(`Rating: ${h.rating.toFixed(1)} (${h.reviewCount || 0} reviews)`);
  }

  const badges: string[] = [];
  if (h.isAvailable) badges.push('Available');
  if (h.isVerified) badges.push('Verified');
  if (h.isFeatured) badges.push('Featured');
  if (badges.length > 0) lines.push(badges.join(' / '));

  if (h.skills && h.skills.length > 0) {
    lines.push(`Skills: ${h.skills.slice(0, 8).join(', ')}${h.skills.length > 8 ? '...' : ''}`);
  }

  if (h.timezone) lines.push(`Timezone: ${h.timezone}`);

  return lines.join('\n');
}

/**
 * Format a booking for display.
 */
export function formatBooking(b: Booking): string {
  const lines: string[] = [];

  lines.push(`**Booking ${b.id}**`);
  lines.push(`Task: ${b.taskTitle}`);
  lines.push(`Human ID: ${b.humanId}`);
  lines.push(`Status: ${b.status.toUpperCase()}`);

  if (b.paymentStatus) lines.push(`Payment: ${b.paymentStatus}`);
  if (b.startTime) lines.push(`Start: ${new Date(b.startTime).toLocaleString()}`);
  if (b.endTime) lines.push(`End: ${new Date(b.endTime).toLocaleString()}`);
  if (b.estimatedHours) lines.push(`Duration: ${b.estimatedHours}h`);
  if (b.totalAmount !== undefined) {
    lines.push(`Total: ${b.totalAmount} ${b.currency || 'USD'}`);
  }
  if (b.taskCategory) lines.push(`Category: ${b.taskCategory}`);

  return lines.join('\n');
}
