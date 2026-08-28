/*
  Stage 9: consent-aware analytics (Google Analytics 4 via gtag.js).

  Google's own Consent Mode default -- analytics_storage/ad_* all start
  "denied" on every page load, before anything else runs -- so even if a
  page somehow errored before the banner rendered, no storage/tracking
  happens by default. gtag.js itself (and the GA4 config call) is never
  even added to the page until a visitor actively accepts AND a real
  Measurement ID is configured (js/analytics-config.js) -- an empty ID
  or "declined" both leave this fully inert.

  main.js's existing track() (window.adorworksTrack) already pushes a
  custom-shaped dataLayer event ({event: "adorworks_event", action, ...})
  documented there as wired for a future GTM container trigger. This file
  additionally bridges those same calls into gtag('event', ...) once
  consent is granted, so GA4 receives real events without needing a
  separate GTM container -- see the end of this file.
*/
(function () {
  "use strict";

  var CONSENT_KEY = "adorworks-analytics-consent"; // "granted" | "denied"

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });

  function hasMeasurementId() {
    return Boolean(window.ADORWORKS_GA_MEASUREMENT_ID);
  }

  function loadGtagScript() {
    if (document.getElementById("ga4-script")) return;
    window.gtag("js", new Date());
    window.gtag("config", window.ADORWORKS_GA_MEASUREMENT_ID);
    var script = document.createElement("script");
    script.id = "ga4-script";
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(window.ADORWORKS_GA_MEASUREMENT_ID);
    // Google's real gtag.js reinstalls its own dataLayer.push once it
    // loads (that's how it processes the queue) -- which would silently
    // clobber installBridge()'s wrapper below, so any adorworks_event
    // fired after this point would stop reaching GA4 with no visible
    // error. Re-installing on top after load keeps the bridge active
    // regardless of what gtag.js did to the array in between.
    script.addEventListener("load", installBridge);
    document.head.appendChild(script);
  }

  function enableAnalytics() {
    window.gtag("consent", "update", { analytics_storage: "granted" });
    if (hasMeasurementId()) loadGtagScript();
  }

  function getStoredConsent() {
    try {
      return window.localStorage.getItem(CONSENT_KEY);
    } catch (e) {
      return null; // private browsing / storage blocked -- treat as undecided, ask again
    }
  }

  function storeConsent(value) {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {
      // Storage unavailable -- the choice just won't persist across visits.
    }
  }

  function renderBanner() {
    var banner = document.createElement("div");
    banner.className = "cookie-consent-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.setAttribute("tabindex", "-1");

    var text = document.createElement("p");
    text.className = "cookie-consent-banner__text";
    text.textContent =
      "We use analytics cookies to understand how people use AdorWorks and improve it. Nothing is tracked unless you accept.";
    banner.appendChild(text);

    var actions = document.createElement("div");
    actions.className = "cookie-consent-banner__actions";

    var declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.className = "btn btn-secondary";
    declineBtn.textContent = "Decline";

    var acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "btn btn-primary";
    acceptBtn.textContent = "Accept";

    function dismiss(decision) {
      storeConsent(decision);
      if (decision === "granted") enableAnalytics();
      banner.remove();
    }

    declineBtn.addEventListener("click", function () {
      dismiss("denied");
    });
    acceptBtn.addEventListener("click", function () {
      dismiss("granted");
    });

    actions.appendChild(declineBtn);
    actions.appendChild(acceptBtn);
    banner.appendChild(actions);

    document.body.appendChild(banner);
    // Focus the region, not either button -- accepting and declining
    // should be equally easy to reach, not nudged one way by default
    // focus (AdorWorks' whole trust positioning cuts against that).
    banner.focus();
  }

  function init() {
    var consent = getStoredConsent();
    if (consent === "granted") {
      enableAnalytics();
    } else if (consent !== "denied") {
      renderBanner();
    }
    // consent === "denied": stay fully inert, don't ask again.
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Bridge main.js's existing custom dataLayer event shape into a real
  // GA4 event once analytics is active. main.js defines window.dataLayer
  // itself too (same `|| []` guard) and calls window.adorworksTrack /
  // pushes directly -- this wraps the array's push method so every entry
  // (regardless of which script authored it) gets a matching gtag('event')
  // call for free, without main.js needing to know gtag exists at all.
  // Re-installable (see loadGtagScript's onload above) rather than a
  // one-shot wrap, since it would otherwise get silently overwritten
  // once gtag.js takes over dataLayer.push for its own processing.
  function installBridge() {
    var currentPush = window.dataLayer.push.bind(window.dataLayer);
    window.dataLayer.push = function (entry) {
      if (entry && typeof entry === "object" && entry.event === "adorworks_event" && hasMeasurementId()) {
        var params = {};
        for (var key in entry) {
          if (key !== "event" && key !== "action") params[key] = entry[key];
        }
        window.gtag("event", entry.action, params);
      }
      return currentPush.apply(window.dataLayer, arguments);
    };
  }
  installBridge();
})();
