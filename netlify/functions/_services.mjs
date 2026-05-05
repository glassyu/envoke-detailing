// Shared service-duration config used by availability, submit-booking, and
// booking-action. Underscore-prefixed file → Netlify treats it as a helper
// rather than deploying it as an HTTP endpoint.

export const SERVICE_DURATIONS_MIN = {
  "Exterior Wash & Shine": 60,
  "Interior Detail": 180,
  "Full Detail": 240,
  "Premium Full Detail": 300,
  // Fallback when customer picks "Not sure — recommend something"
  "Not sure — recommend something": 240,
};

// Travel/cleanup buffer added on top of the service duration so back-to-back
// bookings have breathing room.
export const BUFFER_MIN = 30;

export const DEFAULT_DURATION_MIN = 240;

export function durationFor(service) {
  const v = SERVICE_DURATIONS_MIN[service];
  return typeof v === "number" ? v : DEFAULT_DURATION_MIN;
}

// Parse "10:00 AM" / "1:00 PM" → minutes since midnight.
export function timeToMinutes(time) {
  const m = String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

export function isFlexibleTime(time) {
  return /^flexible/i.test(String(time || ""));
}

// Returns {start, end} minutes-since-midnight for a booking, or null if the
// booking has no resolvable window. Flexible-time bookings block the whole day.
export function bookingWindow(booking) {
  if (isFlexibleTime(booking.preferred_time)) {
    return { start: 0, end: 24 * 60 };
  }
  const start = timeToMinutes(booking.preferred_time);
  if (start == null) return null;
  const dur = durationFor(booking.service) + BUFFER_MIN;
  return { start, end: start + dur };
}

export function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}
