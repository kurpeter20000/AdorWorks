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
      };
      tabs.forEach(function (t, i) { t.addEventListener("click", function () { showPath(i); }); });
      arrowNav(tabs, showPath);
    }

    // Why AdorWorks: each box shows its number and name; clicking it
    // slides the explanation up over the box. One open at a time; Esc or
    // the close button shuts it and returns focus to the box.
    var whyList = document.querySelector(".why-cards");
    if (whyList) {
      var whyCards = Array.prototype.slice.call(whyList.querySelectorAll("[data-why-card]"));
      var closeWhy = function (card, refocus) {
        if (!card.classList.contains("is-open")) return;
        card.classList.remove("is-open");
        var toggle = card.querySelector("[data-why-toggle]");
        toggle.setAttribute("aria-expanded", "false");
        card.querySelector("[data-why-detail]").setAttribute("aria-hidden", "true");
        if (refocus) toggle.focus();
      };
      var openWhy = function (card) {
        whyCards.forEach(function (c) { if (c !== card) closeWhy(c, false); });
        card.classList.add("is-open");
        card.querySelector("[data-why-toggle]").setAttribute("aria-expanded", "true");
        card.querySelector("[data-why-detail]").removeAttribute("aria-hidden");
        card.querySelector("[data-why-close]").focus({ preventScroll: true });
      };
      whyCards.forEach(function (card) {
        card.querySelector("[data-why-detail]").setAttribute("aria-hidden", "true");
        card.querySelector("[data-why-toggle]").addEventListener("click", function () { openWhy(card); });
        card.querySelector("[data-why-close]").addEventListener("click", function () { closeWhy(card, true); });
        card.addEventListener("keydown", function (e) {
          if (e.key === "Escape") closeWhy(card, true);
        });
      });
      // Only now switch the boxes into click-to-open mode, so the text
      // stays readable if this script never runs.
      whyList.classList.add("is-ready");
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
