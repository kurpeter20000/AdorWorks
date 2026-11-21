/* Services page (redesign 2026): the three category tabs, deep links
   from the Services menu (?service=<name>#service-deck-<category>), and
   "Request this service" buttons that pre-select the request form. */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var tablist = document.querySelector("[data-service-tabs]");
    if (!tablist) return;
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll("[role=tab]"));
    var select = document.getElementById("sv-service");

    function show(n) {
      tabs.forEach(function (t, i) {
        var on = i === n;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { show(i); });
      tab.addEventListener("keydown", function (e) {
        var next = "ArrowRight", prev = "ArrowLeft";
        if (document.documentElement.dir === "rtl") { next = "ArrowLeft"; prev = "ArrowRight"; }
        var to = null;
        if (e.key === next) to = (i + 1) % tabs.length;
        if (e.key === prev) to = (i - 1 + tabs.length) % tabs.length;
        if (e.key === "Home") to = 0;
        if (e.key === "End") to = tabs.length - 1;
        if (to === null) return;
        e.preventDefault();
        show(to);
        tabs[to].focus();
      });
    });

    // Pick a service in the form. Options' values are pinned to the
    // English name by js/i18n.js, so this works in every language.
    function choose(title) {
      if (!select || !title) return false;
      var match = Array.prototype.find.call(select.options, function (o) { return o.value === title; });
      if (match) select.value = match.value;
      return Boolean(match);
    }

    document.querySelectorAll("[data-request-service]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        choose(btn.getAttribute("data-request-service"));
        var form = document.getElementById("service-request-form");
        form.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        var first = document.getElementById("sv-name");
        if (first) first.focus({ preventScroll: true });
      });
    });

    // Deep link from the Services menu: open the right tab, pre-select
    // the service and point at its card.
    var hash = window.location.hash.replace("#", "");
    var fromHash = tabs.findIndex(function (t) { return t.getAttribute("aria-controls") === hash; });
    if (fromHash > -1) show(fromHash);
    var wanted = new URLSearchParams(window.location.search).get("service");
    if (wanted && choose(wanted)) {
      var card = document.querySelector('[data-service-title="' + wanted.replace(/"/g, "") + '"]');
      if (card) {
        var panel = card.closest("[role=tabpanel]");
        var idx = tabs.findIndex(function (t) { return t.getAttribute("aria-controls") === panel.id; });
        if (idx > -1) show(idx);
        card.classList.add("is-highlighted");
        card.scrollIntoView({ block: "center" });
      }
    }
  });
})();
