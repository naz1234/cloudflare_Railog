# iPhone Home Screen app mode

The main app and the signed-out login page both declare the same root-scoped,
standalone manifest and the iPhone `apple-mobile-web-app-capable` fallback.
The explicit manifest ID `/` matches the previously inferred ID from `start_url`.
The login Content Security Policy permits manifests from this origin only;
all other login restrictions and authentication checks remain unchanged.

Previously, the login page linked to the manifest but its `default-src 'none'`
policy blocked that request. Neither HTML entry point declared the Apple
standalone fallback. Saving the signed-out page could therefore miss the app's
standalone configuration. This is an installation metadata fix, not a change
to the site's bottom navigation, scrolling or desktop layout.

## Check after deployment

1. Open the production site in Safari, including while signed out. The manifest
   must load without a CSP violation and declare `display: standalone`.
2. Use Share > Add to Home Screen and enable Open as Web App when offered.
   An existing browser shortcut may need to be removed and added again after
   the fix is deployed; the website cannot force an old shortcut into app mode.
3. Launch the new icon, sign in and open PST > Excel / Remarks. Scroll both
   directions, rotate the phone, and check that the browser address bar and
   back/share/refresh controls do not appear. The website's own tabs stay visible.
4. Close and reopen the app and repeat after the session expires. Login and
   return navigation must stay on the same origin and inside scope `/`.

Physical iPhone verification is required: desktop responsive emulation cannot
verify iOS Home Screen installation behavior. External links can still open a
browser, and launching a normal browser bookmark does not enable standalone mode.

References:
- [Apple: Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- [CSP manifest-src](https://www.w3.org/TR/CSP3/#directive-manifest-src)
