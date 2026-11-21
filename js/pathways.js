/* Pathways page: the "show programmes for" filter, and the info pop-ups.
   Pop-ups open on hover and keyboard focus (CSS), and on tap/click here
   for phones; Esc or a tap elsewhere closes them. */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    // Audience filter
    var tablist = document.querySelector("[data-prog-tabs]");
    var grid = document.querySelector("[data-prog-grid]");
    if (tablist && grid) {
      var tabs = Array.prototype.slice.call(tablist.querySelectorAll("[data-aud-tab]"));
      var cards = Array.prototype.slice.call(grid.querySelectorAll("[data-aud]"));
      var show = function (n) {
        var aud = tabs[n].getAttribute("data-aud-tab");
        tabs.forEach(function (t, i) {
          t.setAttribute("aria-selected", String(i === n));
          t.tabIndex = i === n ? 0 : -1;
        });
        cards.forEach(function (c) {
          c.hidden = aud !== "all" && c.getAttribute("data-aud").split(",").indexOf(aud) === -1;
        });
      };
      tabs.forEach(function (tab, i) {
        tab.addEventListener("click", function () { show(i); });
        tab.addEventListener("keydown", function (e) {
          var next = "ArrowRight", prev = "ArrowLeft";
          if (document.documentElement.dir === "rtl") { next = "ArrowLeft"; prev = "ArrowRight"; }
          var to = null;
          if (e.key === next) to = (i + 1) % tabs.length;
          if (e.key === prev) to = (i - 1 + tabs.length) % tabs.length;
          if (to === null) return;
          e.preventDefault();
          show(to);
          tabs[to].focus();
        });
      });
    }

    // Info pop-ups
    var pops = Array.prototype.slice.call(document.querySelectorAll(".pop"));
    var closeAll = function (except) {
      pops.forEach(function (p) {
        if (p === except) return;
        p.classList.remove("is-open");
        var b = p.querySelector(".pop-trigger");
        if (b) b.setAttribute("aria-expanded", "false");
      });
    };
    pops.forEach(function (pop) {
      var btn = pop.querySelector(".pop-trigger");
      var panel = pop.querySelector(".pop-panel");
      if (!btn || !panel) return;
      var id = "pop-" + Math.random().toString(36).slice(2, 9);
      panel.id = id;
      btn.setAttribute("aria-describedby", id);
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = !pop.classList.contains("is-open");
        closeAll(pop);
        pop.classList.toggle("is-open", open);
        btn.setAttribute("aria-expanded", String(open));
      });
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".pop")) closeAll(null);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll(null);
    });
  });
})();
