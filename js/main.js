/*
  AdorWorks site behaviour: nav toggle, analytics event hooks, form submission.

  Analytics: pushes to window.dataLayer (Google Tag Manager convention).
  Wire up GTM/GA4 by dropping the container snippet in each page's <head>
  and creating a trigger on event name "adorworks_event" — no code changes
  needed here. See /README.md.

  Forms: every form built for Netlify Forms (data-netlify="true"). Netlify
  detects each one from the static HTML at deploy time; this script just
  intercepts submission to POST it via fetch and show inline status,
  instead of a full page reload to Netlify's default success page.
*/
(function () {
  "use strict";

  window.dataLayer = window.dataLayer || [];

  function track(action, detail) {
    window.dataLayer.push(
      Object.assign({ event: "adorworks_event", action: action }, detail || {})
    );
  }
  window.adorworksTrack = track;

  document.addEventListener("DOMContentLoaded", function () {
    // Mobile nav toggle
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("site-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var isOpen = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
      });
      nav.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          if (window.innerWidth < 960) {
            nav.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
          }
        });
      });
    }

    // Click tracking: WhatsApp, phone, downloads
    document.querySelectorAll('a[href^="https://wa.me"]').forEach(function (a) {
      a.addEventListener("click", function () {
        track("whatsapp_click", { link_url: a.href, link_text: a.textContent.trim() });
      });
    });
    document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
      a.addEventListener("click", function () {
        track("phone_click", { link_url: a.href });
      });
    });
    document.querySelectorAll("a[data-download]").forEach(function (a) {
      a.addEventListener("click", function () {
        track("download", { file: a.getAttribute("data-download") });
      });
    });

    // Generic Netlify-form submission handler — every form on the site
    // carries class "js-form" and a data-form-id used for analytics + the
    // status message it should show on success.
    function encodeFormData(data) {
      return Array.from(data.entries())
        .map(function (pair) {
          return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]);
        })
        .join("&");
    }

    document.querySelectorAll("form.js-form").forEach(function (form) {
      var formId = form.getAttribute("data-form-id") || form.getAttribute("name") || "form";
      var status = form.querySelector(".form-status") || document.getElementById(form.getAttribute("aria-describedby") || "");
      var successMessage = form.getAttribute("data-success-message") ||
        "Thanks — we've received this and a member of the AdorWorks team will follow up.";

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var data = new FormData(form);
        fetch("/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: encodeFormData(data),
        })
          .then(function (res) {
            if (res.ok) {
              track("form_submit", { form_id: formId });
              form.reset();
              showStatus("success", successMessage);
            } else {
              showStatus(
                "error",
                "Something went wrong sending that (form backend not connected yet on this host?). Please try WhatsApp instead."
              );
            }
          })
          .catch(function () {
            showStatus(
              "error",
              "Something went wrong sending that (form backend not connected yet on this host?). Please try WhatsApp instead."
            );
          });
      });

      function showStatus(kind, message) {
        if (!status) return;
        status.textContent = message;
        status.className = "form-status is-visible " + kind;
        status.setAttribute("role", "status");
      }
    });
  });
})();
