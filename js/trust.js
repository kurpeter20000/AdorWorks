/* Trust & Safety page (redesign 2026): the verification-tier tabs
   (tiers up to the chosen one show as reached) and the anonymous
   option on the report form, which clears and disables the contact
   field so nothing identifying is sent. */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var box = document.querySelector("[data-tiers]");
    if (box) {
      var tabs = Array.prototype.slice.call(box.querySelectorAll("[data-tier-tab]"));
      var panels = Array.prototype.slice.call(box.querySelectorAll("[data-tier-panel]"));
      var show = function (n) {
        tabs.forEach(function (t, i) {
          t.setAttribute("aria-selected", String(i === n));
          t.tabIndex = i === n ? 0 : -1;
          t.classList.toggle("is-reached", i <= n);
        });
        panels.forEach(function (p, i) { p.hidden = i !== n; });
      };
      tabs.forEach(function (tab, i) {
        tab.addEventListener("click", function () { show(i); });
        tab.addEventListener("keydown", function (e) {
          var to = null;
          if (e.key === "ArrowDown" || e.key === "ArrowRight") to = Math.min(i + 1, tabs.length - 1);
          if (e.key === "ArrowUp" || e.key === "ArrowLeft") to = Math.max(i - 1, 0);
          if (e.key === "Home") to = 0;
          if (e.key === "End") to = tabs.length - 1;
          if (to === null) return;
          e.preventDefault();
          show(to);
          tabs[to].focus();
        });
      });
    }

    var anon = document.querySelector("[data-report-anonymous]");
    var contact = document.querySelector("[data-report-contact]");
    if (anon && contact) {
      anon.addEventListener("change", function () {
        if (anon.checked) contact.value = "";
        contact.disabled = anon.checked;
      });
      // form.reset() after sending unticks the box; re-enable the field.
      anon.form.addEventListener("reset", function () { contact.disabled = false; });
    }
  });
})();
