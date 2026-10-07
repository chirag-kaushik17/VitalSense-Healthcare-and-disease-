import { el } from "./ui.js";

const ns = "http://www.w3.org/2000/svg";
const positions = {
  patients: [280, 120],
  encounters: [60, 30],
  conditions: [500, 30],
  lab_results: [60, 240],
  vitals: [500, 240],
  risk_predictions: [280, 320],
};

function svg(tag, attrs = {}) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export function erd() {
  const diagram = svg("svg", { viewBox: "0 0 680 405", class: "erd-svg", role: "img", "aria-label": "Entity relationship diagram: encounters, conditions, lab results, vitals, and risk predictions each reference patients with many-to-one relationships and cascade deletes" });
  for (const table of ["encounters", "conditions", "lab_results", "vitals", "risk_predictions"]) {
    const [x1, y1] = positions[table];
    const [x2, y2] = positions.patients;
    diagram.append(svg("line", { x1: x1 + 72, y1: y1 + 35, x2: x2 + 72, y2: y2 + 35, stroke: "var(--line-strong)", "stroke-width": 2 }));
    const label = svg("text", { x: (x1 + x2 + 144) / 2, y: (y1 + y2 + 70) / 2 - 6, fill: "var(--muted)", "font-size": 10, "text-anchor": "middle" });
    label.textContent = "patient_id";
    diagram.append(label);
  }
  for (const [name, [x, y]] of Object.entries(positions)) {
    const anchor = svg("a", { href: `#/database/${name}`, tabindex: 0, "aria-label": `Open ${name} table details` });
    const rect = svg("rect", { x, y, width: 144, height: 70, rx: 10, fill: "var(--surface)", stroke: name === "patients" ? "var(--teal)" : "var(--line-strong)", "stroke-width": name === "patients" ? 2.5 : 1.5 });
    const title = svg("text", { x: x + 72, y: y + 31, "text-anchor": "middle", fill: "var(--ink)", "font-size": 12, "font-weight": 700 });
    title.textContent = name;
    const kind = svg("text", { x: x + 72, y: y + 50, "text-anchor": "middle", fill: "var(--muted)", "font-size": 10 });
    kind.textContent = name === "patients" ? "one" : "many-to-one";
    anchor.append(rect, title, kind);
    diagram.append(anchor);
  }
  return el("div", { className: "erd-wrap" }, diagram);
}