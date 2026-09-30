/*
  Loaded in <head>, before the page paints: if the visitor picked Arabic or
  Swahili, keep the page invisible for the moment it takes js/i18n.js to
  swap the text in, so they don't see a flash of English first. Always
  lifted after 3s, so a failed dictionary load can never leave a blank page.
*/
(function () {
  try {
    var lang = new URLSearchParams(location.search).get("lang") || localStorage.getItem("aw_lang");
    if (lang === "ar" || lang === "sw") {
      var root = document.documentElement;
      root.classList.add("aw-i18n-pending");
      if (lang === "ar") root.dir = "rtl";
      root.lang = lang;
      setTimeout(function () {
        root.classList.remove("aw-i18n-pending");
      }, 3000);
    }
  } catch (e) {
    /* storage blocked: page simply starts in English */
  }
})();
