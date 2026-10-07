import { icon, el } from "./ui.js";
import * as overview from "./views/overview.js";
import * as dashboard from "./views/dashboard.js";
import * as patients from "./views/patients.js";
import * as patient from "./views/patient.js";
import * as database from "./views/database.js";
import * as about from "./views/about.js";

const root = document.getElementById("app");
const pageRoot = el("main", { className: "main-content", id: "page-content", "aria-live": "polite" });
const navItems = [
  ["overview", "Overview", "overview"],
  ["dashboard", "Results Dashboard", "dashboard"],
  ["patients", "Patients", "patients"],
  ["database", "Database", "database"],
  ["about", "About", "about"],
];
const modules = { overview, dashboard, patients, patient, database, about };
let routeController;

const sidebar = el("aside", { className: "sidebar", "aria-label": "Main navigation" });
const brand = el("a", { className: "brand", href: "#/" },
  el("img", { src: "assets/favicon.svg", alt: "" }),
  el("span", {}, "VitalSense"),
);
const nav = el("nav", { className: "nav-list", "aria-label": "Primary" });
for (const [key, label, glyph] of navItems) {
  nav.append(el("a", { className: "nav-link", href: key === "overview" ? "#/" : `#/${key}`, dataset: { route: key } }, icon(glyph), el("span", {}, label)));
}
const themeButton = el("button", { type: "button", className: "icon-button theme-toggle", title: "Toggle theme", "aria-label": "Toggle color theme" });
const themeMobile = el("button", { type: "button", className: "icon-button mobile-theme", title: "Toggle theme", "aria-label": "Toggle color theme" });
const docsLink = el("a", { href: "/docs" }, "API docs");
sidebar.append(brand, nav, el("div", { className: "sidebar-spacer" }), el("div", { className: "sidebar-footer" }, docsLink, themeButton));

const banner = el("div", { className: "demo-banner" }, icon("pulse"), "Demo using synthetic Synthea data. Not for clinical use.");
root.replaceChildren(el("div", { className: "app-shell" }, sidebar, themeMobile, el("div", { className: "main-column" }, banner, pageRoot)));

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const name = theme === "dark" ? "sun" : "moon";
  themeButton.replaceChildren(icon(name));
  themeMobile.replaceChildren(icon(name));
  themeButton.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  themeMobile.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
}

function initialTheme() {
  try {
    const saved = localStorage.getItem("vitalsense-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Storage can be disabled by the browser. */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

applyTheme(initialTheme());
for (const toggle of [themeButton, themeMobile]) {
  toggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("vitalsense-theme", next); } catch { /* Theme remains active for this page. */ }
  });
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { parts, params: new URLSearchParams(query) };
}

function routeKey(parts) {
  if (!parts.length) return "overview";
  if (parts[0] === "dashboard") return "dashboard";
  if (parts[0] === "patients") return parts[1] ? "patient" : "patients";
  if (parts[0] === "database") return "database";
  if (parts[0] === "about") return "about";
  return "overview";
}

async function renderRoute() {
  routeController?.abort();
  routeController = new AbortController();
  const { parts, params } = parseRoute();
  const key = routeKey(parts);
  const view = modules[key];
  const topNav = key === "patient" ? "patients" : key === "database" ? "database" : key;
  for (const linkNode of nav.querySelectorAll(".nav-link")) {
    if (linkNode.dataset.route === topNav) linkNode.setAttribute("aria-current", "page");
    else linkNode.removeAttribute("aria-current");
  }
  const title = key === "patient" ? "Patient detail" : key === "database" && parts[1] ? `${parts[1]} table` : ({ overview: "Overview", dashboard: "Results Dashboard", patients: "Patients", database: "Database", about: "About" }[key]);
  document.title = `VitalSense | ${title}`;
  pageRoot.dataset.route = key;
  await view.render(pageRoot, {
    signal: routeController.signal,
    parts,
    params,
    navigate: (hash) => { location.hash = hash.startsWith("#") ? hash : `#${hash}`; },
  });
  pageRoot.focus?.();
}

if (!location.hash) history.replaceState(null, "", `${location.pathname}${location.search}#/`);
window.addEventListener("hashchange", renderRoute);
renderRoute();