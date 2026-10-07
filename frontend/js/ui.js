const ICONS = {
  low: "M5 12l4 4L19 6",
  moderate: "M5 12h14",
  high: "M12 3l10 18H2L12 3zm0 6v5m0 3h.01",
  search: "M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z",
  refresh: "M20 7v5h-5M4 17v-5h5m-4.1-2A7 7 0 0 1 17 6l3 2m-16 8 3 2a7 7 0 0 0 12.1-4",
  copy: "M8 8V4h12v12h-4M4 8h12v12H4z",
  chevron: "M9 18l6-6-6-6",
  pulse: "M2 12h5l3-8 4 16 3-8h5",
  overview: "M3 10.5 12 3l9 7.5M5 9v11h14V9m-9 11v-6h4v6",
  dashboard: "M4 19V5m0 14h17M8 15l3-4 3 2 5-7",
  patients: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7-7.8a4 4 0 0 1 0 7.6m4 10.2v-2a4 4 0 0 0-3-3.9",
  database: "M12 3C7 3 3 4.8 3 7s4 4 9 4 9-1.8 9-4-4-4-9-4zm-9 4v10c0 2.2 4 4 9 4s9-1.8 9-4V7m-18 5c0 2.2 4 4 9 4s9-1.8 9-4",
  about: "M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z",
  moon: "M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5z",
  sun: "M12 3v2m0 14v2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42M3 12h2m14 0h2M5.64 18.36l1.42-1.42m9.88-9.88 1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
};

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (name === "className") node.className = value;
    else if (name === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (name === "text") node.textContent = value;
    else if (name.startsWith("on") && typeof value === "function") node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (name === "dataset") Object.assign(node.dataset, value);
    else if (name in node && !name.startsWith("aria-") && name !== "role") node[name] = value;
    else node.setAttribute(name, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function icon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICONS[name] || ICONS.pulse);
  svg.append(path);
  return svg;
}

export function button(label, onClick, className = "button") {
  return el("button", { type: "button", className, onclick: onClick }, label);
}

export function link(label, href, className = "") {
  return el("a", { href, className }, label);
}

export function badge(category) {
  const value = String(category || "unknown").toLowerCase();
  return el("span", { className: `badge badge-${["low", "moderate", "high"].includes(value) ? value : "neutral"}` }, icon(value), value);
}

export function metric(label, value, detail = "") {
  return el("article", { className: "metric" },
    el("span", { className: "metric-label" }, label),
    el("strong", { className: "metric-value" }, value),
    detail ? el("span", { className: "metric-detail" }, detail) : null,
  );
}

export function scoreBar(value, category = "") {
  const score = Math.max(0, Math.min(1, Number(value) || 0));
  return el("div", { className: "cluster" },
    el("div", { className: "score-track", role: "img", "aria-label": `Risk score ${(score * 100).toFixed(0)} percent` },
      el("div", { className: `score-fill ${category}`, style: { width: `${score * 100}%` } }),
    ),
    el("span", { className: "small tabular" }, score.toFixed(2)),
  );
}

export function table(headers, rows, className = "data-table") {
  const head = el("thead", {}, el("tr", {}, ...headers.map((header) => el("th", { scope: "col" }, header))));
  const body = el("tbody", {}, ...rows.map((cells) => el("tr", {}, ...cells.map((cell) => el("td", {}, cell)))));
  return el("table", { className }, head, body);
}

export function emptyState(title, message = "") {
  return el("div", { className: "empty-state", role: "status" },
    el("strong", {}, title),
    message ? el("span", {}, message) : null,
  );
}

export async function withLoad(root, signal, loader, render) {
  const skeleton = el("div", { className: "stack", "aria-label": "Loading data", "aria-busy": "true" },
    el("div", { className: "skeleton", style: { height: "92px" } }),
    el("div", { className: "grid-2" }, el("div", { className: "skeleton", style: { height: "200px" } }), el("div", { className: "skeleton", style: { height: "200px" } })),
  );
  root.replaceChildren(skeleton);
  try {
    const data = await loader();
    if (signal?.aborted) return;
    root.replaceChildren(render(data));
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") return;
    root.replaceChildren(el("div", { className: "error-state", role: "alert" },
      el("strong", {}, "Couldn't load this view"),
      el("span", {}, error instanceof Error ? error.message : "The API request failed."),
      button("Retry", () => withLoad(root, signal, loader, render), "button button-primary"),
    ));
  }
}

export function toast(message) {
  document.querySelector(".toast")?.remove();
  const node = el("div", { className: "toast", role: "status" }, message);
  document.body.append(node);
  window.setTimeout(() => node.remove(), 1800);
}

export function formatNumber(value, digits = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
}

export function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function titleCase(value) {
  return String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function copyButton(value) {
  return el("button", {
    type: "button",
    className: "copy-button",
    title: "Copy MRN",
    "aria-label": "Copy MRN",
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(String(value || ""));
        toast("MRN copied");
      } catch {
        toast("Clipboard unavailable");
      }
    },
  }, icon("copy"));
}