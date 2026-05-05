// Shared service-duration + scheduling config used by availability,
// submit-booking, and booking-action. Underscore-prefixed file → Netlify
// treats it as a helper rather than deploying it as an HTTP endpoint.

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

// Work hours (Mon–Sun). All times are minutes since midnight.
// Customers can start jobs no earlier than WORK_START_MIN and the job's
// service duration must finish by WORK_END_MIN.
export const WORK_START_MIN = 9 * 60; // 9:00 AM
export const WORK_END_MIN = 20 * 60; // 8:00 PM

// Earliest date customers can book. Format: YYYY-MM-DD. Bumped forward when
// you want to push the booking calendar out; not auto-rolling.
export const MIN_BOOKING_DATE = "2026-05-11";

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
// booking has no resolvable window (flexible-time, unparseable, or otherwise
// not a fixed slot). Callers treat null as "doesn't block anything" — the
// owner handles those manually over text.
//
// `booking.duration_min` overrides the service-default duration when set,
// useful for manual bookings that don't follow the standard menu durations.
export function bookingWindow(booking) {
  if (isFlexibleTime(booking.preferred_time)) return null;
  const start = timeToMinutes(booking.preferred_time);
  if (start == null) return null;
  const baseDur =
    typeof booking.duration_min === "number" && booking.duration_min > 0
      ? booking.duration_min
      : durationFor(booking.service);
  const dur = baseDur + BUFFER_MIN;
  return { start, end: start + dur };
}

export function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}
