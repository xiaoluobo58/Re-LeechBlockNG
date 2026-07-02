/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const browser = chrome;

var gBlockedURL = "";

function getElement(id) { return document.getElementById(id); }

function showError(text) {
	let errorDiv = getElement("lbCustomMsgDiv");
	let errorText = getElement("lbGoalError");
	errorText.innerText = text;
	errorDiv.style.display = "";
}

function processGoalInfo(info) {
	if (!info) return;

	gBlockedURL = info.blockedURL || "";

	let themeLink = getElement("themeLink");
	if (themeLink) {
		themeLink.href = "/themes/" + (info.theme ? `${info.theme}.css` : "default.css");
	}

	let customStyle = getElement("customStyle");
	if (customStyle) {
		customStyle.innerText = info.customStyle || "";
	}

	let goalURL = getElement("lbGoalURL");
	if (gBlockedURL && goalURL) {
		goalURL.innerText = gBlockedURL.length > 60 ? gBlockedURL.substring(0, 57) + "..." : gBlockedURL;
	}

	let goalURLLink = getElement("lbGoalURLLink");
	if (gBlockedURL && goalURLLink) {
		goalURLLink.setAttribute("href", gBlockedURL);
	}

	if (info.goal && info.goal.currentText) {
		getElement("lbGoalInput").value = info.goal.currentText;
	}
	if (info.goal && info.goal.planMins) {
		getElement("lbGoalPlanMins").value = info.goal.planMins;
	}
}

function onSubmitGoal() {
	let goalText = getElement("lbGoalInput").value.trim();
	let planMins = Math.floor(+getElement("lbGoalPlanMins").value);

	if (!goalText) {
		showError(browser.i18n.getMessage("goalErrorMissingGoal") || "Enter a goal.");
		return;
	}
	if (!(planMins > 0)) {
		showError(browser.i18n.getMessage("goalErrorBadMinutes") || "Enter a positive number of minutes.");
		return;
	}

	browser.runtime.sendMessage({
		type: "goal-submit",
		goalText: goalText,
		planMins: planMins,
		blockedURL: gBlockedURL
	});
}

getElement("lbGoalForm").addEventListener("submit", onSubmitGoal);
browser.runtime.sendMessage({ type: "goal-info" }).then(processGoalInfo);
