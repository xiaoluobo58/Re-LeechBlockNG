/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Runtime DOM localizer.
 *
 * chrome.i18n does not substitute text in HTML pages (only in the manifest
 * and CSS), so this script walks the DOM on load and replaces the contents of
 * any element carrying an i18n marker attribute. Translations live in
 * _locales/<lang>/messages.json (single source of truth).
 *
 * Markers (value = message key in messages.json):
 *   data-i18n             -> textContent
 *   data-i18n-html        -> innerHTML (for messages containing trusted static
 *                            markup such as <code>, <a>, <strong>)
 *   data-i18n-placeholder -> placeholder attribute
 *   data-i18n-title       -> title attribute
 *   data-i18n-label       -> label attribute (e.g. <optgroup>)
 *   data-i18n-value       -> value attribute (e.g. submit buttons)
 *
 * If a key is missing in the active locale, chrome.i18n falls back to the
 * default locale (en); if it is missing there too, getMessage returns "" and
 * we keep the original HTML text so nothing is ever blanked out.
 */

(function () {
	"use strict";

	const i18n = (typeof browser !== "undefined" ? browser : chrome).i18n;

	// Get a message, returning null (instead of "") when it is not defined so
	// callers can decide to keep the existing markup as a fallback.
	function msg(key) {
		if (!key) return null;
		let text = i18n.getMessage(key);
		return text ? text : null;
	}

	// Attribute-based replacements: marker attribute -> how to apply the value
	const ATTR_TARGETS = [
		{ attr: "data-i18n", apply: (el, t) => { el.textContent = t; } },
		{ attr: "data-i18n-html", apply: (el, t) => { el.innerHTML = t; } },
		{ attr: "data-i18n-placeholder", apply: (el, t) => { el.setAttribute("placeholder", t); } },
		{ attr: "data-i18n-title", apply: (el, t) => { el.setAttribute("title", t); } },
		{ attr: "data-i18n-label", apply: (el, t) => { el.setAttribute("label", t); } },
		{ attr: "data-i18n-value", apply: (el, t) => { el.setAttribute("value", t); } }
	];

	function localizePage() {
		for (let target of ATTR_TARGETS) {
			let elements = document.querySelectorAll(`[${target.attr}]`);
			for (let el of elements) {
				let text = msg(el.getAttribute(target.attr));
				if (text != null) {
					target.apply(el, text);
				}
			}
		}

		// Localize the document title if a key is provided on <html>/<body>.
		let titleKey = document.documentElement.getAttribute("data-i18n-document-title")
				|| document.body && document.body.getAttribute("data-i18n-document-title");
		let title = msg(titleKey);
		if (title != null) {
			document.title = title;
		}

		// Reflect the active UI language on the root element.
		let lang = i18n.getUILanguage();
		if (lang) {
			document.documentElement.setAttribute("lang", lang);
		}
	}

	// Expose for page scripts that build DOM dynamically and need to re-localize.
	window.localizePage = localizePage;

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", localizePage);
	} else {
		localizePage();
	}
})();
