// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Block past dates on date inputs
const today = new Date().toISOString().split("T")[0];
document.querySelectorAll('input[type="date"]').forEach((el) => {
  el.min = today;
});

// Show a thank-you state when redirected after a successful Netlify form submit
if (new URLSearchParams(window.location.search).get("submitted") === "true") {
  const form = document.querySelector(".request-form");
  if (form) {
    form.innerHTML = `
      <div class="form-success">
        <p class="eyebrow">Request received</p>
        <h3>Thanks — I'll be in touch.</h3>
        <p>I'll text you at the number you provided to confirm the time and give you a quote. Usually within a few hours.</p>
      </div>
    `;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
