// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Block past dates on date inputs
const today = new Date().toISOString().split("T")[0];
document.querySelectorAll('input[type="date"]').forEach((el) => {
  el.min = today;
});

// Booking form: submit via fetch to the Netlify Function, show inline success/error.
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
