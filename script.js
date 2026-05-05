// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Cal.com inline embed
// SETUP: Replace CAL_LINK below with your real Cal.com link after you create an
// event type, e.g. "envokedetailing/detail" or "ryan-detailing/booking".
// Find it in Cal.com under: Event Types -> [your event] -> "Public link".
const CAL_LINK = "envokedetailing/detail";

(function (C, A, L) {
  let p = function (a, ar) { a.q.push(ar); };
  let d = C.document;
  C.Cal = C.Cal || function () {
    let cal = C.Cal;
    let ar = arguments;
    if (!cal.loaded) {
      cal.ne = [];
      cal.q = [];
      cal.loaded = true;
      cal.version = "1.5.0";
      let ifr = d.createElement("script");
      ifr.src = A;
      ifr.async = true;
      d.head.appendChild(ifr);
    }
    if (ar.length < 1) return;
    if (typeof ar[0] === "string") { p(cal, ar); return; }
    cal.ne.push(ar);
  };
})(window, "https://app.cal.com/embed/embed.js", "init");

Cal("init", "envoke-detailing", { origin: "https://cal.com" });

Cal.ns["envoke-detailing"]("inline", {
  elementOrSelector: "#cal-inline",
  config: { layout: "month_view", theme: "dark" },
  calLink: CAL_LINK,
});

Cal.ns["envoke-detailing"]("ui", {
  theme: "dark",
  cssVarsPerTheme: {
    dark: {
      "cal-brand": "#c9a44c",
      "cal-bg": "#101216",
      "cal-bg-emphasis": "#161a20",
      "cal-bg-muted": "#08090b",
      "cal-border": "#20242c",
      "cal-text": "#f3f3f4",
      "cal-text-muted": "#a1a4ac",
    },
  },
  hideEventTypeDetails: false,
});
