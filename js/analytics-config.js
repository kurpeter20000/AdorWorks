/*
  Stage 9: consent-aware analytics.

  Leave this blank until a real Google Analytics 4 property exists
  (analytics.google.com -> Admin -> Data Streams -> your web stream ->
  Measurement ID, looks like "G-XXXXXXXXXX"). js/analytics.js checks this
  value before ever loading Google's script: an empty ID means analytics
  stays fully inert regardless of what a visitor chooses in the cookie
  banner, exactly the same "no ID, no live calls" pattern already used
  for MTN MoMo/m-Gurush in the platform app (see platform/.env.local.example)
  and for Resend email — real scaffolding, not a fabricated integration.
*/
window.ADORWORKS_GA_MEASUREMENT_ID = "G-9QJ10JJFKP";
