/*
  AdorWorks site behaviour: nav toggle, analytics event hooks, form submission.

  Analytics: pushes to window.dataLayer (Google Tag Manager convention).
  js/analytics.js (loaded after this file on every page) is what actually
  turns these into real GA4 events, gated behind cookie consent and a
  configured Measurement ID (js/analytics-config.js) — see that file for
  how. This file doesn't need to know analytics exists at all.

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

  // Service worker: makes the site installable and usable offline. Safe to
  // skip silently on browsers without support (e.g. some older phones).
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {
        // Offline-capability is a progressive enhancement — a failed
        // registration should never block the page from working.
      });
    });
  }

  // "Install app" prompt: Chrome/Edge/Android fire beforeinstallprompt
  // instead of showing install UI automatically everywhere, so we capture
  // it and inject our own dismissible banner (built here rather than in
  // each page's markup, so every page gets it for free). iOS Safari has no
  // such event — install there is manual via the Share sheet — so the
  // banner simply never appears for those visitors.
  var deferredInstallPrompt = null;
  var INSTALL_DISMISSED_KEY = "adorworks_install_dismissed";

  function safeSessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (err) { return null; }
  }
  function safeSessionSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (err) { /* ignore */ }
  }

  function showInstallBanner() {
    if (document.getElementById("install-banner")) return;
    if (safeSessionGet(INSTALL_DISMISSED_KEY)) return;

    var banner = document.createElement("div");
    banner.id = "install-banner";
    banner.className = "install-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Install AdorWorks");
    banner.innerHTML =
      '<span class="install-banner-text">Install AdorWorks for quicker access, even with a weak connection.</span>' +
      '<span class="install-banner-actions">' +
      '<button type="button" class="btn btn-primary" data-install-accept>Install</button>' +
      '<button type="button" class="install-banner-dismiss" data-install-dismiss aria-label="Dismiss">&times;</button>' +
      "</span>";
    document.body.appendChild(banner);
  }

  function hideInstallBanner() {
    var banner = document.getElementById("install-banner");
    if (banner) banner.remove();
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallBanner();
  });

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-install-accept]") && deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(function (choice) {
        track("pwa_install_prompt", { outcome: choice.outcome });
        deferredInstallPrompt = null;
        hideInstallBanner();
      });
    }
    if (e.target.closest("[data-install-dismiss]")) {
      safeSessionSet(INSTALL_DISMISSED_KEY, "1");
      hideInstallBanner();
    }
  });

  window.addEventListener("appinstalled", function () {
    hideInstallBanner();
    track("pwa_installed", {});
  });

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

    // Hero background video: decorative only (muted, looping, no controls),
    // not the talent-facing video feature, so none of that consent/caption
    // handling applies here. Skipped on narrow screens, reduced-motion or a
    // Data Saver connection -- the poster frame already shown via the
    // `poster` attribute is the low-data fallback in every one of those
    // cases, and autoplay staying off never leaves the section blank.
    var heroVideos = document.querySelectorAll(".hero-video");
    if (heroVideos.length) {
      var saveData = Boolean(navigator.connection && navigator.connection.saveData);
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var wideEnough = window.matchMedia("(min-width: 768px)").matches;
      if (wideEnough && !reduceMotion && !saveData) {
        heroVideos.forEach(function (heroVideo) {
          heroVideo.muted = true;
          heroVideo.play().catch(function () {
            // Autoplay blocked by the browser -- poster frame stays visible.
          });
        });
      }
    }

    // Scroll-reveal: cards and section intros ease in as they enter the
    // viewport. Elements only get the (initially invisible via CSS) .reveal
    // class from here, so a script failure or missing IntersectionObserver
    // support never hides content -- it just skips the animation.
    if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var revealTargets = document.querySelectorAll(".card, .section-header");
      var revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
      );
      revealTargets.forEach(function (el, i) {
        el.classList.add("reveal");
        el.style.transitionDelay = (i % 3) * 0.08 + "s";
        revealObserver.observe(el);
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

    // Netlify form name -> the intake_submissions.form_type this becomes
    // once a Supabase project is configured (see js/supabase-config.js).
    var SUPABASE_FORM_TYPE = {
      "adorworks-talent": "talent_application",
      "adorworks-employer": "employer_brief",
      "adorworks-service": "service_request",
      "adorworks-contact": "general_contact",
      "adorworks-insights-subscribe": "insights_subscribe",
    };

    function supabaseConfigured() {
      return Boolean(window.ADORWORKS_SUPABASE_URL && window.ADORWORKS_SUPABASE_ANON_KEY);
    }

    function submitToSupabase(form, data) {
      var formType = SUPABASE_FORM_TYPE[form.getAttribute("name")];
      if (!formType) {
        return Promise.reject(new Error("No Supabase form_type mapped for this form."));
      }
      var payload = {};
      data.forEach(function (value, key) {
        if (key === "form-name" || key === "bot-field") return;
        payload[key] = value;
      });
      return fetch(window.ADORWORKS_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/intake_submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: window.ADORWORKS_SUPABASE_ANON_KEY,
          Authorization: "Bearer " + window.ADORWORKS_SUPABASE_ANON_KEY,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ form_type: formType, payload: payload }),
      });
    }

    function submitToNetlify(data) {
      return fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encodeFormData(data),
      });
    }

    document.querySelectorAll("form.js-form").forEach(function (form) {
      var formId = form.getAttribute("data-form-id") || form.getAttribute("name") || "form";
      var status = form.querySelector(".form-status") || document.getElementById(form.getAttribute("aria-describedby") || "");
      var successMessage = form.getAttribute("data-success-message") ||
        "Thanks — we've received this and a member of the AdorWorks team will follow up.";

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var data = new FormData(form);

        // Silent honeypot: a filled hidden field means a bot filled the
        // form. Netlify checks this server-side on its own path, but a
        // direct-to-Supabase submission needs the same check done here.
        if (data.get("bot-field")) {
          form.reset();
          showStatus("success", successMessage);
          return;
        }

        var submission = supabaseConfigured() ? submitToSupabase(form, data) : submitToNetlify(data);

        submission
          .then(function (res) {
            if (res.ok) {
              track("form_submit", { form_id: formId });
              form.reset();
              showStatus("success", successMessage);
            } else {
              showStatus(
                "error",
                "Something went wrong sending that. Please try WhatsApp instead."
              );
            }
          })
          .catch(function () {
            showStatus(
              "error",
              "Something went wrong sending that. Please try WhatsApp instead."
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
