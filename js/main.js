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

    // Hero audience toggle (homepage only): updates the full opening
    // story—copy, image, search intent and quick links—so employers and
    // talent each get a clear first action without duplicating the hero.
    var heroAudience = document.querySelector("[data-hero-audience]");
    if (heroAudience) {
      var hero = heroAudience.closest(".hero-home") || document;
      var audienceTabs = heroAudience.querySelectorAll("[data-audience-tab]");
      var searchForm = heroAudience.querySelector("[data-audience-search]");
      var searchInput = searchForm ? searchForm.querySelector("input[name=q]") : null;

      function updateSearchPlaceholder(audience) {
        if (!searchInput) return;
        var placeholder = searchInput.getAttribute("data-audience-placeholder-" + audience);
        if (placeholder) searchInput.placeholder = placeholder;
      }

      function setAudience(audience) {
        audienceTabs.forEach(function (tab) {
          tab.setAttribute("aria-selected", String(tab.getAttribute("data-audience-tab") === audience));
        });
        heroAudience.querySelectorAll("[data-audience-chips]").forEach(function (el) {
          el.hidden = el.getAttribute("data-audience-chips") !== audience;
        });
        hero.querySelectorAll("[data-audience-copy]").forEach(function (el) {
          var copy = el.getAttribute("data-" + audience);
          if (copy) el.textContent = copy;
        });
        hero.querySelectorAll("[data-audience-image]").forEach(function (el) {
          el.hidden = el.getAttribute("data-audience-image") !== audience;
        });
        hero.querySelectorAll("[data-audience-label]").forEach(function (el) {
          var label = el.getAttribute("data-" + audience);
          if (label) el.textContent = label;
        });
        if (searchForm) searchForm.action = audience === "talent" ? "jobs-projects.html" : "for-employers.html";
        updateSearchPlaceholder(audience);
        track("hero_audience_switch", { audience: audience });
      }

      audienceTabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          setAudience(tab.getAttribute("data-audience-tab"));
        });
      });

      updateSearchPlaceholder("employer");
    }

    // Category search-match highlight: if a visitor arrives at
    // for-employers.html (or is redirected there from the homepage
    // search) with a ?q= term, scroll to and highlight any matching
    // category card instead of the search silently going nowhere.
    var categoryCards = document.querySelectorAll(".category-card");
    if (categoryCards.length) {
      var q = new URLSearchParams(window.location.search).get("q");
      if (q && q.trim()) {
        var needle = q.trim().toLowerCase();
        var firstMatch = null;
        categoryCards.forEach(function (card) {
          if (card.textContent.toLowerCase().indexOf(needle) !== -1) {
            card.classList.add("is-match");
            if (!firstMatch) firstMatch = card;
          }
        });
        if (firstMatch) {
          firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }

    // Service detail modal (services.html): each category card's photo
    // tiles open a shared <dialog> with the full deliverable/inputs/
    // excludes detail plus prev/next through that same category's tiles.
    var serviceModal = document.getElementById("service-modal");
    if (serviceModal && typeof serviceModal.showModal === "function") {
      var serviceGroups = Array.from(document.querySelectorAll("[data-service-group]")).map(function (group) {
        return {
          name: group.getAttribute("data-service-group"),
          tiles: Array.from(group.querySelectorAll(".service-tile")),
        };
      });
      var modalPhoto = document.getElementById("service-modal-photo");
      var modalCategory = document.getElementById("service-modal-category");
      var modalTitle = document.getElementById("service-modal-title");
      var modalFacts = document.getElementById("service-modal-facts");
      var modalPosition = document.getElementById("service-modal-position");
      var modalRequest = document.getElementById("service-modal-request");
      var modalPrev = serviceModal.querySelector("[data-modal-prev]");
      var modalNext = serviceModal.querySelector("[data-modal-next]");
      var activeGroup = null;
      var activeIndex = 0;

      function renderService() {
        var tile = activeGroup.tiles[activeIndex];
        var img = tile.querySelector("img");
        modalPhoto.src = img.currentSrc || img.src;
        modalCategory.textContent = activeGroup.name;
        modalTitle.textContent = tile.getAttribute("data-title");
        modalRequest.setAttribute("data-service-title", tile.getAttribute("data-title"));

        var facts = "";
        facts += "<dt>Deliverable</dt><dd>" + tile.getAttribute("data-deliverable") + "</dd>";
        facts += "<dt>Inputs needed</dt><dd>" + tile.getAttribute("data-inputs") + "</dd>";
        var timeframe = tile.getAttribute("data-timeframe");
        if (timeframe) facts += "<dt>Typical timeframe</dt><dd>" + timeframe + "</dd>";
        facts += "<dt>Excludes</dt><dd>" + tile.getAttribute("data-excludes") + "</dd>";
        modalFacts.innerHTML = facts;

        modalPosition.textContent = (activeIndex + 1) + " of " + activeGroup.tiles.length;
        modalPrev.disabled = activeGroup.tiles.length < 2;
        modalNext.disabled = activeGroup.tiles.length < 2;
      }

      function openService(group, index) {
        activeGroup = group;
        activeIndex = index;
        renderService();
        if (!serviceModal.open) serviceModal.showModal();
        track("service_detail_view", { service: activeGroup.tiles[activeIndex].getAttribute("data-title") });
      }

      function step(delta) {
        if (!activeGroup) return;
        var len = activeGroup.tiles.length;
        activeIndex = (activeIndex + delta + len) % len;
        renderService();
      }

      // Tile clicks are wired by initServiceCoverflows() below, not here
      // directly -- each category's tiles now sit inside their own mini
      // 3D coverflow, so a click needs to mean "select" when the tile
      // isn't already centred and only "open the detail modal" (this
      // openService) once it is. Passing this function in keeps the
      // modal itself unaware that coverflow exists.
      initServiceCoverflows(serviceGroups, openService);

      modalPrev.addEventListener("click", function () { step(-1); });
      modalNext.addEventListener("click", function () { step(1); });

      serviceModal.addEventListener("click", function (e) {
        if (e.target === serviceModal || e.target.closest("[data-modal-close]")) {
          serviceModal.close();
        }
      });

      serviceModal.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") step(-1);
        if (e.key === "ArrowRight") step(1);
      });

      // Preselect the matching option in the "Request a service" form below
      // instead of just scrolling to a blank dropdown.
      modalRequest.addEventListener("click", function () {
        var select = document.getElementById("sv-service");
        var title = modalRequest.getAttribute("data-service-title");
        if (select && title) {
          var match = Array.from(select.options).find(function (opt) { return opt.text === title; });
          if (match) select.value = match.value;
        }
        serviceModal.close();
      });
    }

    // Service coverflow (services.html): each category's four service
    // tiles are their own independent 3D coverflow -- one active,
    // sharp, slightly enlarged card in front, the other three receding
    // (smaller, faded, lightly blurred and rotated) either side. Same
    // index-driven, --offset-custom-property mechanism as the CSS
    // (see .service-coverflow-slide in styles.css): one activeIndex per
    // panel, written to each slide, with every visual property a pure
    // calc() function of that number in CSS -- this function only ever
    // manages one integer per category.
    //
    // Interaction: clicking a tile that ISN'T the active one re-centres
    // it (same "select" pattern as the old homepage coverflow); clicking
    // the ALREADY-active tile calls openService(group, index) -- the
    // exact function the modal itself uses, passed in as a parameter so
    // this function never needs to know how the modal works internally.
    // Supports touch swipe and mouse drag via pointer events (not
    // setPointerCapture -- see the flat carousels elsewhere in this file
    // for why that breaks click targeting) and Left/Right arrow keys.
    function initServiceCoverflows(serviceGroups, openService) {
      var reduceMotionForServiceCoverflow = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      document.querySelectorAll("[data-service-coverflow]").forEach(function (coverflow) {
        var groupName = coverflow.getAttribute("data-service-group");
        var group = serviceGroups.filter(function (g) { return g.name === groupName; })[0];
        if (!group) return;

        var slides = Array.from(coverflow.querySelectorAll("[data-service-coverflow-slide]"));
        var prevBtn = coverflow.querySelector("[data-service-coverflow-prev]");
        var nextBtn = coverflow.querySelector("[data-service-coverflow-next]");
        var dots = Array.from(coverflow.querySelectorAll("[data-service-coverflow-dot]"));
        var stage = coverflow.querySelector("[data-service-coverflow-stage]");
        var activeIndex = 0;

        function render() {
          slides.forEach(function (slide, i) {
            var offset = i - activeIndex;
            var isActive = offset === 0;
            slide.style.setProperty("--offset", String(offset));
            slide.dataset.active = String(isActive);
            var tile = slide.querySelector(".service-tile");
            if (tile) tile.tabIndex = isActive ? 0 : -1;
          });
          if (prevBtn) prevBtn.disabled = activeIndex <= 0;
          if (nextBtn) nextBtn.disabled = activeIndex >= slides.length - 1;
          dots.forEach(function (dot, i) {
            dot.setAttribute("aria-selected", String(i === activeIndex));
          });
        }

        function goTo(index) {
          var clamped = Math.max(0, Math.min(slides.length - 1, index));
          if (clamped === activeIndex) return;
          activeIndex = clamped;
          render();
          track("service_coverflow_select", { category: groupName, index: activeIndex });
        }

        if (prevBtn) prevBtn.addEventListener("click", function () { goTo(activeIndex - 1); });
        if (nextBtn) nextBtn.addEventListener("click", function () { goTo(activeIndex + 1); });
        dots.forEach(function (dot, i) {
          dot.addEventListener("click", function () { goTo(i); });
        });

        slides.forEach(function (slide, i) {
          var tile = slide.querySelector(".service-tile");
          if (!tile) return;
          tile.addEventListener("click", function () {
            if (i === activeIndex) {
              openService(group, i);
            } else {
              goTo(i);
            }
          });
        });

        if (stage) {
          stage.addEventListener("keydown", function (e) {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              goTo(activeIndex - 1);
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              goTo(activeIndex + 1);
            }
          });

          // Touch swipe / mouse drag to navigate: a release-time
          // direction check, not continuous tracking, since slides are
          // absolutely positioned (not a real scroll container) --
          // there's no scrollLeft to drag. window-level listeners so a
          // swipe that leaves the stage mid-gesture still resolves.
          var swiping = false;
          var swiped = false;
          var swipeStartX = 0;
          stage.addEventListener("pointerdown", function (e) {
            swiping = true;
            swiped = false;
            swipeStartX = e.clientX;
          });
          window.addEventListener("pointermove", function (e) {
            if (!swiping) return;
            if (Math.abs(e.clientX - swipeStartX) > 6) swiped = true;
          });
          window.addEventListener("pointerup", function (e) {
            if (!swiping) return;
            swiping = false;
            if (!swiped) return;
            var delta = e.clientX - swipeStartX;
            if (Math.abs(delta) > 40) goTo(activeIndex + (delta < 0 ? 1 : -1));
          });
          window.addEventListener("pointercancel", function () { swiping = false; });
          // Swallow the click a real swipe would otherwise also fire on
          // release, same "dragged" suppression pattern used by the
          // flat scroll carousels elsewhere in this file.
          stage.addEventListener(
            "click",
            function (e) {
              if (swiped) {
                e.stopPropagation();
                e.preventDefault();
              }
            },
            true
          );
        }

        render();
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

    // Scroll reveal: cards and section content fade/rise gently into
    // place as they enter the viewport (restrained -- no bounce, no
    // looping, short distance/duration -- matching this file's existing
    // "mobile-first, restrained animation" principle). Progressive
    // enhancement only: the .reveal class -- the thing that actually
    // hides content pre-animation -- is added by this script, so with
    // JS disabled or IntersectionObserver unsupported, content is just
    // visible with no animation, never stuck hidden. Skipped entirely
    // under prefers-reduced-motion rather than animated then hidden.
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // .work-path-card is excluded even though it's also a .card: it lives
    // inside a horizontally-clipped carousel (.work-path-viewport), and
    // IntersectionObserver correctly treats a card scrolled out of that
    // clipped area as "not intersecting" -- so the off-screen 5th card
    // would never fire and stay stuck at opacity 0 forever, since this
    // observer is built for vertical scroll-into-view, not a manually
    // scrolled strip. .service-tile is excluded for the same reason
    // (now living inside .service-coverflow-slide, itself clipped by
    // the stage's overflow:hidden) plus a second one: its own opacity
    // is already a live calc() function of --offset in CSS, so a
    // separate .reveal/.is-revealed opacity toggle on the same element
    // would fight that, not just risk getting stuck.
    var revealTargets = document.querySelectorAll(
      ".card:not(.work-path-card), .step, .category-banner, .notice, .tier-card"
    );
    if (revealTargets.length && "IntersectionObserver" in window && !reduceMotion) {
      revealTargets.forEach(function (el) { el.classList.add("reveal"); });

      // Stagger by position among reveal-eligible siblings (capped) so a
      // row of cards cascades in rather than popping simultaneously.
      var groups = new Map();
      revealTargets.forEach(function (el) {
        var parent = el.parentElement || document.body;
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent).push(el);
      });
      groups.forEach(function (siblings) {
        siblings.forEach(function (el, index) {
          el.style.transitionDelay = (Math.min(index, 5) * 70) + "ms";
        });
      });

      var revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-revealed");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
      );
      revealTargets.forEach(function (el) { revealObserver.observe(el); });
    }

    // Work-path carousel (homepage "five ways to work"): a plain flat,
    // scroll-snap carousel -- the two arrows move the viewport by
    // exactly one card and disable at either end (same pattern as the
    // services page's category rows). Touch swipe and trackpad
    // scrolling work natively via overflow-x; click-and-drag with a
    // mouse doesn't, so it's added here.
    var workPathViewport = document.querySelector("[data-work-path-viewport]");
    if (workPathViewport) {
      var workPathPrev = document.querySelector("[data-work-path-prev]");
      var workPathNext = document.querySelector("[data-work-path-next]");
      var reduceMotionForWorkPath = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      function updateWorkPathArrows() {
        var max = workPathViewport.scrollWidth - workPathViewport.clientWidth;
        if (workPathPrev) workPathPrev.disabled = workPathViewport.scrollLeft <= 4;
        if (workPathNext) workPathNext.disabled = workPathViewport.scrollLeft >= max - 4;
      }

      function stepWorkPath(direction) {
        var card = workPathViewport.querySelector(".work-path-card");
        var gap = parseFloat(getComputedStyle(workPathViewport.querySelector(".work-path-track")).columnGap || getComputedStyle(workPathViewport.querySelector(".work-path-track")).gap || "0");
        var step = card ? card.getBoundingClientRect().width + gap : workPathViewport.clientWidth;
        workPathViewport.scrollBy({ left: direction * step, behavior: reduceMotionForWorkPath ? "auto" : "smooth" });
      }

      if (workPathPrev) {
        workPathPrev.addEventListener("click", function () {
          stepWorkPath(-1);
          track("work_path_nav", { direction: "prev" });
        });
      }
      if (workPathNext) {
        workPathNext.addEventListener("click", function () {
          stepWorkPath(1);
          track("work_path_nav", { direction: "next" });
        });
      }
      workPathViewport.addEventListener("scroll", updateWorkPathArrows);
      window.addEventListener("resize", updateWorkPathArrows);
      // A "scroll"/"resize" event isn't the only thing that can change
      // how much there is left to scroll (late web-font swap, etc.) --
      // see services.html's identical ResizeObserver fix for why this
      // is a correctness measure, not a nice-to-have.
      if ("ResizeObserver" in window) {
        new ResizeObserver(updateWorkPathArrows).observe(workPathViewport);
      }
      updateWorkPathArrows();

      // Mouse click-and-drag: window-level move/up listeners, NOT
      // setPointerCapture -- capturing the pointer on the viewport
      // redirects the click event's own target resolution away from
      // whichever card link is underneath it, in this browser's
      // implementation, breaking every card click (see services.html's
      // identical fix for the full explanation). A 4px threshold before
      // it counts as a drag (rather than a click), and the click that
      // follows a real drag is suppressed once so releasing over a
      // card's link doesn't navigate.
      var workPathDragging = false;
      var workPathDragged = false;
      var workPathDragStartX = 0;
      var workPathDragStartScroll = 0;
      workPathViewport.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "mouse") return;
        workPathDragging = true;
        workPathDragged = false;
        workPathDragStartX = e.clientX;
        workPathDragStartScroll = workPathViewport.scrollLeft;
      });
      window.addEventListener("pointermove", function (e) {
        if (!workPathDragging) return;
        var delta = e.clientX - workPathDragStartX;
        if (Math.abs(delta) > 4) workPathDragged = true;
        workPathViewport.scrollLeft = workPathDragStartScroll - delta;
      });
      window.addEventListener("pointerup", function () { workPathDragging = false; });
      window.addEventListener("pointercancel", function () { workPathDragging = false; });
      workPathViewport.addEventListener(
        "click",
        function (e) {
          if (workPathDragged) {
            e.stopPropagation();
            e.preventDefault();
          }
        },
        true
      );
    }
  });
})();
