// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Block past dates on date inputs. The actual floor is also pushed forward
// once availability loads (MIN_BOOKING_DATE from the server config).
const today = new Date().toISOString().split("T")[0];
document.querySelectorAll('input[type="date"]').forEach((el) => {
  el.min = today;
});

// ---------- Availability ----------
// Pull confirmed busy windows from the function. When the user has picked a
// service + date, gray out time options whose [start, start+duration+buffer]
// window overlaps with anything already booked. The longest-running services
// can block several hours, so we can't just blacklist start times.

const dateTimePairs = [
  ["preferred_date", "preferred_time"],
  ["backup_date", "backup_time"],
];

let busyWindows = []; // [{date, start, end}] minutes since midnight
let serviceDurations = {};
let bufferMin = 30;
let workStartMin = 9 * 60;
let workEndMin = 20 * 60;
let minBookingDate = null;

async function loadAvailability() {
  try {
    const res = await fetch("/.netlify/functions/availability", { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    busyWindows = Array.isArray(body.busy) ? body.busy : [];
    serviceDurations = body.durations || {};
    bufferMin = typeof body.bufferMin === "number" ? body.bufferMin : 30;
    if (typeof body.workStartMin === "number") workStartMin = body.workStartMin;
    if (typeof body.workEndMin === "number") workEndMin = body.workEndMin;
    if (body.minDate) minBookingDate = body.minDate;
    applyDateFloor();
    refreshAllTimeOptions();
  } catch (err) {
    // Silent — availability is a UX nicety. Server-side check still enforces.
    console.warn("Could not load availability:", err);
  }
}

function applyDateFloor() {
  if (!minBookingDate) return;
  const floor = minBookingDate > today ? minBookingDate : today;
  document.querySelectorAll('input[type="date"]').forEach((el) => {
    el.min = floor;
    if (el.value && el.value < floor) el.value = "";
  });
}

function timeToMinutes(time) {
  const m = String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function selectedServiceDuration() {
  const serviceEl = document.querySelector('[name="service"]');
  if (!serviceEl || !serviceEl.value) return null;
  const dur = serviceDurations[serviceEl.value];
  return typeof dur === "number" ? dur : null;
}

function refreshTimeOptions(dateName, timeName) {
  const dateEl = document.querySelector(`[name="${dateName}"]`);
  const timeEl = document.querySelector(`[name="${timeName}"]`);
  if (!dateEl || !timeEl) return;

  const date = dateEl.value;
  const serviceDur = selectedServiceDuration();

  // Reset all options first.
  for (const opt of timeEl.options) {
    opt.disabled = false;
    if (opt.value) opt.textContent = opt.value;
  }

  let currentBecameUnavailable = false;
  const dayBusy = date ? busyWindows.filter((b) => b.date === date) : [];

  for (const opt of timeEl.options) {
    if (!opt.value || /^flexible/i.test(opt.value)) continue;
    const start = timeToMinutes(opt.value);
    if (start == null) continue;

    // Out-of-hours: end time runs past close. Service-aware, so a 1-hour
    // wash at 7 PM is fine but a 5-hour Premium at 7 PM is not.
    if (serviceDur != null && start + serviceDur > workEndMin) {
      opt.disabled = true;
      opt.textContent = `${opt.value} — too late`;
      if (opt.selected) currentBecameUnavailable = true;
      continue;
    }

    // Conflict with an existing confirmed booking on the same date.
    if (serviceDur != null && date && dayBusy.length) {
      const end = start + serviceDur + bufferMin;
      const conflict = dayBusy.some((b) => start < b.end && b.start < end);
      if (conflict) {
        opt.disabled = true;
        opt.textContent = `${opt.value} — unavailable`;
        if (opt.selected) currentBecameUnavailable = true;
      }
    }
  }
  if (currentBecameUnavailable) timeEl.value = "";
}

function refreshAllTimeOptions() {
  dateTimePairs.forEach(([dn, tn]) => refreshTimeOptions(dn, tn));
}

// Re-fetch availability before filtering so we never act on stale data
// (e.g. owner added a manual booking while this tab was open).
async function reloadAndRefresh() {
  await loadAvailability();
}

dateTimePairs.forEach(([dn, tn]) => {
  const dateEl = document.querySelector(`[name="${dn}"]`);
  if (dateEl) dateEl.addEventListener("change", reloadAndRefresh);
});

const serviceEl = document.querySelector('[name="service"]');
if (serviceEl) serviceEl.addEventListener("change", reloadAndRefresh);

loadAvailability();

// ---------- Form submission ----------

const form = document.getElementById("booking-form");
const errorEl = document.getElementById("booking-error");
const submitBtn = document.getElementById("booking-submit");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();
    setSubmitting(true);

    const data = collectFormData(form);

    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      let body = {};
      try { body = await res.json(); } catch { /* ignore */ }

      if (res.status === 409) {
        // Slot conflict — refresh availability and show the server's message.
        showError(body.error || "That slot was just booked. Please pick another.");
        await loadAvailability();
        setSubmitting(false);
        return;
      }

      if (!res.ok || !body.ok) {
        throw new Error(body.error || `Server returned ${res.status}`);
      }

      showSuccess(data);
    } catch (err) {
      console.error(err);
      showError(
        "Couldn't send your request — please text 380-222-1158 or email rsabdon@gmail.com directly.",
      );
      setSubmitting(false);
    }
  });
}

function collectFormData(form) {
  const formData = new FormData(form);
  const data = {};
  const addons = [];
  for (const [key, value] of formData.entries()) {
    if (key === "addons") {
      addons.push(value);
    } else if (key in data) {
      data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
    } else {
      data[key] = value;
    }
  }
  if (addons.length) data.addons = addons;
  return data;
}

function setSubmitting(isSubmitting) {
  if (!submitBtn) return;
  submitBtn.disabled = isSubmitting;
  submitBtn.textContent = isSubmitting ? "Sending…" : "Send booking request";
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function hideError() {
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function showSuccess(data) {
  const firstName = (data.name || "").trim().split(/\s+/)[0] || "there";
  form.innerHTML = `
    <div class="form-success">
      <p class="eyebrow">Request received</p>
      <h3>Thanks, ${escapeHtml(firstName)} — check your email.</h3>
      <p>I sent a confirmation to <b>${escapeHtml(data.email || "")}</b>. I'll text you at <b>${escapeHtml(data.phone || "")}</b> within a few hours to lock in the time and quote you a price.</p>
    </div>
  `;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
