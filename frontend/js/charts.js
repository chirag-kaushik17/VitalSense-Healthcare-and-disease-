import { el, formatNumber } from "./ui.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const COLOR = { low: "var(--low)", moderate: "var(--moderate)", high: "var(--high)", teal: "var(--teal)", blue: "var(--blue)", grid: "var(--line)" };

function svgNode(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  for (const child of children) if (child) node.append(child);
  return node;
}

function accessibleSvg(label, viewBox = "0 0 320 200") {
  return svgNode("svg", { viewBox, role: "img", "aria-label": label, focusable: "false" });
}

export function donutChart(parent, counts, label = "Risk category distribution") {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (!total) return parent.append(el("p", { className: "muted small" }, "No patient scores available."));
  const svg = accessibleSvg(label, "0 0 220 180");
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  for (const category of ["low", "moderate", "high"]) {
    const length = circumference * (counts[category] || 0) / total;
    svg.append(svgNode("circle", {
      cx: 110, cy: 86, r: radius, fill: "none", stroke: COLOR[category], "stroke-width": 22,
      "stroke-dasharray": `${length} ${circumference - length}`, "stroke-dashoffset": -offset,
      transform: "rotate(-90 110 86)", tabindex: 0,
    }, svgNode("title", {}, document.createTextNode(`${category}: ${counts[category] || 0}`))));
    offset += length;
  }
  svg.append(svgNode("text", { x: 110, y: 82, "text-anchor": "middle", fill: "var(--ink)", "font-size": 24, "font-weight": 750 }, document.createTextNode(formatNumber(total))));
  svg.append(svgNode("text", { x: 110, y: 104, "text-anchor": "middle", fill: "var(--muted)", "font-size": 11 }, document.createTextNode("patients")));
  parent.append(svg);
}

export function histogram(parent, bins) {
  if (!bins?.length) return parent.append(el("p", { className: "muted small" }, "No score distribution available."));
  const width = 360;
  const height = 210;
  const left = 28;
  const top = 12;
  const plotWidth = 310;
  const plotHeight = 150;
  const maxValue = Math.max(...bins.map((bin) => bin.count), 1);
  const svg = accessibleSvg("Risk score histogram with category threshold markers", `0 0 ${width} ${height}`);
  for (const threshold of [0.33, 0.66]) {
    const x = left + plotWidth * threshold;
    svg.append(svgNode("line", { x1: x, x2: x, y1: top, y2: top + plotHeight, stroke: COLOR.moderate, "stroke-dasharray": "4 4", "stroke-width": 1.5 }));
    svg.append(svgNode("text", { x, y: 10, "text-anchor": "middle", fill: "var(--muted)", "font-size": 10 }, document.createTextNode(threshold.toFixed(2))));
  }
  bins.forEach((bin, index) => {
    const slot = plotWidth / bins.length;
    const barHeight = plotHeight * bin.count / maxValue;
    const category = bin.start < 0.33 ? "low" : bin.start < 0.66 ? "moderate" : "high";
    const rect = svgNode("rect", {
      x: left + index * slot + 3, y: top + plotHeight - barHeight,
      width: slot - 6, height: Math.max(1, barHeight), rx: 3, fill: COLOR[category], tabindex: 0,
    });
    rect.append(svgNode("title", {}, document.createTextNode(`${bin.range}: ${bin.count} patients`)));
    svg.append(rect);
  });
  svg.append(svgNode("line", { x1: left, x2: left + plotWidth, y1: top + plotHeight, y2: top + plotHeight, stroke: COLOR.grid }));
  svg.append(svgNode("text", { x: left, y: top + plotHeight + 22, fill: "var(--muted)", "font-size": 11 }, document.createTextNode("0.0")));
  svg.append(svgNode("text", { x: left + plotWidth, y: top + plotHeight + 22, "text-anchor": "end", fill: "var(--muted)", "font-size": 11 }, document.createTextNode("1.0 risk score")));
  parent.append(svg);
}

export function horizontalBars(parent, items, { labelKey = "measure", valueKey = "pct", countKey = "patients_out_of_range", suffix = "%" } = {}) {
  if (!items?.length) return parent.append(el("p", { className: "muted small" }, "No measurements available."));
  const max = Math.max(...items.map((item) => Number(item[valueKey]) || 0), 1);
  const list = el("div", { className: "stack" });
  for (const item of items) {
    const value = Number(item[valueKey]) || 0;
    const bar = el("div", { className: "score-track", role: "img", "aria-label": `${item[labelKey]}: ${formatNumber(value, 1)}${suffix}, ${item[countKey] ?? 0} patients` },
      el("div", { className: "score-fill", style: { width: `${value / max * 100}%` } }),
    );
    list.append(el("div", { className: "bar-row" },
      el("div", { className: "cluster bar-caption" }, el("strong", {}, item[labelKey]), el("span", { className: "muted small" }, `${formatNumber(value, 1)}${suffix} · ${formatNumber(item[countKey] || 0)} patients`)),
      bar,
    ));
  }
  parent.append(list);
}

export function scatter(parent, points) {
  if (!points?.length) return parent.append(el("p", { className: "muted small" }, "No score components available."));
  const svg = accessibleSvg("Patient score components: own risk on the horizontal axis and high-risk neighbor fraction on the vertical axis", "0 0 360 240");
  const left = 42, top = 15, width = 290, height = 175;
  for (const fraction of [0, .5, 1]) {
    const x = left + fraction * width;
    const y = top + (1 - fraction) * height;
    svg.append(svgNode("line", { x1: x, x2: x, y1: top, y2: top + height, stroke: COLOR.grid }));
    svg.append(svgNode("line", { x1: left, x2: left + width, y1: y, y2: y, stroke: COLOR.grid }));
  }
  for (const point of points) {
    const circle = svgNode("circle", {
      cx: left + Math.max(0, Math.min(1, point.own_risk)) * width,
      cy: top + (1 - Math.max(0, Math.min(1, point.neighbor_fraction))) * height,
      r: 3.5, fill: COLOR[point.category] || COLOR.teal, opacity: .72, tabindex: 0,
    });
    circle.append(svgNode("title", {}, document.createTextNode(`Own risk ${Number(point.own_risk).toFixed(2)}, neighbor fraction ${Number(point.neighbor_fraction).toFixed(2)}, ${point.category}`)));
    svg.append(circle);
  }
  svg.append(svgNode("text", { x: left + width / 2, y: 222, "text-anchor": "middle", fill: "var(--muted)", "font-size": 11 }, document.createTextNode("Own risk")));
  svg.append(svgNode("text", { x: 12, y: top + height / 2, transform: `rotate(-90 12 ${top + height / 2})`, "text-anchor": "middle", fill: "var(--muted)", "font-size": 11 }, document.createTextNode("High-risk neighbors")));
  parent.append(svg);
}

export function gauge(score, label = "Risk score") {
  const value = Math.max(0, Math.min(1, Number(score) || 0));
  const svg = accessibleSvg(`${label}: ${(value * 100).toFixed(0)} percent`, "0 0 200 125");
  const path = "M 20 108 A 80 80 0 0 1 180 108";
  const arc = svgNode("path", { d: path, fill: "none", stroke: "var(--line)", "stroke-width": 16, "stroke-linecap": "round" });
  const length = Math.PI * 80;
  const valueArc = svgNode("path", { d: path, fill: "none", stroke: `var(--${value < .33 ? "low" : value < .66 ? "moderate" : "high"})`, "stroke-width": 16, "stroke-linecap": "round", "stroke-dasharray": length, "stroke-dashoffset": length * (1 - value), class: "gauge-value" });
  svg.append(arc, valueArc);
  for (const tick of [.33, .66]) {
    const angle = Math.PI - Math.PI * tick;
    const x = 100 + 87 * Math.cos(angle);
    const y = 108 - 87 * Math.sin(angle);
    svg.append(svgNode("circle", { cx: x, cy: y, r: 2.3, fill: "var(--ink-soft)" }));
  }
  return svg;
}

export function sparkline(values, label = "Recent measurements") {
  const data = values.map(Number).filter(Number.isFinite);
  const svg = accessibleSvg(label, "0 0 180 54");
  if (data.length < 2) return svg;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const points = data.map((value, index) => `${index / (data.length - 1) * 174 + 3},${47 - (value - min) / span * 40}`).join(" ");
  svg.append(svgNode("polyline", { points, fill: "none", stroke: COLOR.teal, "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  return svg;
}

export function lineChart(parent, series, { label = "Measurement trend", range = null } = {}) {
  const values = series.flatMap((item) => item.values.map((entry) => Number(entry.value)).filter(Number.isFinite));
  if (!values.length) return parent.append(el("p", { className: "muted small" }, "No recorded measurements."));
  const min = Math.min(...values, range?.low ?? Infinity);
  const max = Math.max(...values, range?.high ?? -Infinity);
  const span = max - min || 1;
  const svg = accessibleSvg(label, "0 0 360 190");
  const left = 38, top = 12, width = 306, height = 140;
  const y = (value) => top + height - ((value - min) / span) * height;
  const x = (index, count) => left + (count <= 1 ? width / 2 : index / (count - 1) * width);
  if (range && range.low !== null && range.high !== null) {
    svg.append(svgNode("rect", { x: left, y: y(range.high), width, height: Math.max(0, y(range.low) - y(range.high)), fill: "var(--low-soft)", opacity: .8 }));
  }
  for (const [seriesIndex, item] of series.entries()) {
    const points = item.values.map((entry, index) => `${x(index, item.values.length)},${y(Number(entry.value))}`).join(" ");
    svg.append(svgNode("polyline", { points, fill: "none", stroke: item.color || (seriesIndex ? COLOR.blue : COLOR.teal), "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    item.values.forEach((entry, index) => {
      const point = svgNode("circle", { cx: x(index, item.values.length), cy: y(Number(entry.value)), r: 3, fill: item.color || (seriesIndex ? COLOR.blue : COLOR.teal), tabindex: 0 });
      point.append(svgNode("title", {}, document.createTextNode(`${item.name}: ${entry.value} at ${new Date(entry.measured_at).toLocaleDateString()}`)));
      svg.append(point);
    });
  }
  svg.append(svgNode("line", { x1: left, x2: left + width, y1: top + height, y2: top + height, stroke: COLOR.grid }));
  svg.append(svgNode("text", { x: left, y: 178, fill: "var(--muted)", "font-size": 10 }, document.createTextNode("Earlier")));
  svg.append(svgNode("text", { x: left + width, y: 178, "text-anchor": "end", fill: "var(--muted)", "font-size": 10 }, document.createTextNode("Latest")));
  parent.append(svg);
}

export function stackedBar(parent, groups) {
  const list = el("div", {});
  const colorClass = { low: "var(--low)", moderate: "var(--moderate)", high: "var(--high)" };
  for (const [name, group] of Object.entries(groups)) {
    const n = Math.max(group.n, 1);
    const track = el("div", { className: "stacked-track", role: "img", "aria-label": `${name}: low ${group.category_counts.low}, moderate ${group.category_counts.moderate}, high ${group.category_counts.high}` });
    for (const category of ["low", "moderate", "high"]) track.append(el("span", { style: { width: `${group.category_counts[category] / n * 100}%`, background: colorClass[category] }, title: `${category}: ${group.category_counts[category]}` }));
    list.append(el("div", { className: "group-row" }, el("strong", {}, name), track, el("span", { className: "tabular" }, formatNumber(group.avg_risk, 2)), el("span", { className: "muted tabular" }, `n=${group.n}`)));
  }
  parent.append(list);
}