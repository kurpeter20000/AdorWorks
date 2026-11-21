/* Homepage (redesign 2026): the "five ways" tabs and the How it works
   switch. The hero's I'm hiring / I'm looking for work switch is in
   main.js (data-hero-audience). Keyboard: arrow keys move between tabs,
   as in the ARIA tabs pattern. */
(function () {
  "use strict";

  function arrowNav(tabs, activate) {
    tabs.forEach(function (tab, i) {
      tab.addEventListener("keydown", function (e) {
        var vertical = tab.closest("[aria-orientation='vertical']");
        var next = vertical ? "ArrowDown" : "ArrowRight";
        var prev = vertical ? "ArrowUp" : "ArrowLeft";
        if (document.documentElement.dir === "rtl" && !vertical) {
          var t = next; next = prev; prev = t;
        }
        // A vertical list becomes a sideways chip row on phones, so it
        // also takes left/right arrows.
        if (vertical) {
          var rtl = document.documentElement.dir === "rtl";
          if (e.key === (rtl ? "ArrowLeft" : "ArrowRight")) next = e.key;
          if (e.key === (rtl ? "ArrowRight" : "ArrowLeft")) prev = e.key;
        }
        var to = null;
        if (e.key === next) to = (i + 1) % tabs.length;
        if (e.key === prev) to = (i - 1 + tabs.length) % tabs.length;
        if (e.key === "Home") to = 0;
        if (e.key === "End") to = tabs.length - 1;
        if (to === null) return;
        e.preventDefault();
        activate(to);
        tabs[to].focus();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Five ways to work with us
    var paths = document.querySelector("[data-paths]");
    if (paths) {
      var tabs = Array.prototype.slice.call(paths.querySelectorAll("[data-path]"));
      var panels = Array.prototype.slice.call(paths.querySelectorAll("[data-path-panel]"));
      var panelBox = paths.querySelector("[role=tabpanel]");
      var showPath = function (n) {
        tabs.forEach(function (t, i) {
          t.setAttribute("aria-selected", String(i === n));
          t.tabIndex = i === n ? 0 : -1;
        });
        panels.forEach(function (p, i) { p.hidden = i !== n; });
        if (panelBox) panelBox.setAttribute("aria-labelledby", tabs[n].id);
        // Phones: keep the chosen chip fully in view in the sideways row.
        var row = tabs[n].parentElement;
        if (row && row.scrollWidth > row.clientWidth) {
          var tr = tabs[n].getBoundingClientRect(), rr = row.getBoundingClientRect();
          if (tr.left < rr.left + 20) row.scrollBy({ left: tr.left - rr.left - 20, behavior: "smooth" });
          else if (tr.right > rr.right - 20) row.scrollBy({ left: tr.right - rr.right + 20, behavior: "smooth" });
        }
      };
      tabs.forEach(function (t, i) { t.addEventListener("click", function () { showPath(i); }); });
      arrowNav(tabs, showPath);
    }

    // How it works: employers / talent
    var how = document.querySelector("[data-how]");
    if (how) {
      var howTabs = Array.prototype.slice.call(how.querySelectorAll("[data-how-tab]"));
      var title = how.querySelector("[data-how-title]");
      var showHow = function (n) {
        var who = howTabs[n].getAttribute("data-how-tab");
        howTabs.forEach(function (t, i) {
          t.setAttribute("aria-selected", String(i === n));
          t.tabIndex = i === n ? 0 : -1;
        });
        how.querySelectorAll("[data-how-steps]").forEach(function (list) {
          list.hidden = list.getAttribute("data-how-steps") !== who;
        });
        if (title) title.textContent = title.getAttribute("data-" + who);
      };
      howTabs.forEach(function (t, i) { t.addEventListener("click", function () { showHow(i); }); });
      arrowNav(howTabs, showHow);
    }
  });
})();
