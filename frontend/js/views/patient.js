import { get } from "../api.js";
import { gauge, lineChart, sparkline } from "../charts.js";
import { badge, button, el, formatDate, formatDateTime, formatNumber, table, titleCase, withLoad } from "../ui.js";

function rangeText(item) {
  if (item.low !== null && item.low !== undefined && item.high !== null && item.high !== undefined) return `${item.low}–${item.high}`;
  if (item.low !== null && item.low !== undefined) return `≥ ${item.low}`;
  if (item.high !== null && item.high !== undefined) return `≤ ${item.high}`;
  return "No range defined";
}

function statusChip(label, active) {
  return el("span", { className: `badge ${active ? "badge-moderate" : "badge-neutral"}` }, label);
}

function outOfRangePanel(items) {
  const panel = el("section", { className: "panel panel-pad" }, el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, "Why this score"), el("p", {}, "Available values outside configured reference ranges."))));
  if (!items.length) {
    panel.append(el("div", { className: "empty-state" }, el("strong", {}, "All available measurements are in range.")));
    return panel;
  }
  const rows = items.map((item) => {
    const direction = item.low !== null && item.low !== undefined && item.value < item.low ? "Below range" : "Above range";
    const boundary = direction === "Below range" ? item.low : item.high;
    const percent = boundary ? Math.abs(item.value - boundary) / Math.abs(boundary) * 100 : null;
    return [item.measure, formatNumber(item.value, 2), rangeText(item), direction, percent === null ? "—" : `${formatNumber(percent, 1)}%`];
  });
  panel.append(el("div", { className: "scroll-x" }, table(["Measure", "Value", "Normal range", "Direction", "Outside by"], rows)));
  return panel;
}

function riskSummary(risk) {
  const highCount = risk.neighbors.filter((neighbor) => neighbor.high_risk).length;
  return el("div", { className: "gauge-grid" },
    el("div", { className: "gauge-wrap" }, gauge(risk.risk_score), el("div", { className: "gauge-number" }, formatNumber(risk.risk_score, 2)), badge(risk.risk_category)),
    el("div", {},
      el("p", {}, `${titleCase(risk.risk_category)} risk: ${risk.out_of_range.length} measurement${risk.out_of_range.length === 1 ? " is" : "s are"} outside the normal range and ${highCount} of ${risk.neighbors.length} similar patients are high-risk.`),
      el("div", { className: "contribution-grid" },
        el("div", { className: "contribution" }, el("strong", {}, formatNumber(risk.own_risk * .6, 2)), el("span", {}, `Own measurements × ${formatNumber(.6, 1)}`)),
        el("div", { className: "contribution" }, el("strong", {}, formatNumber(risk.neighbor_high_risk_fraction * .4, 2)), el("span", {}, `Similar patients × ${formatNumber(.4, 1)}`)),
      ),
      el("p", { className: "muted small" }, `Own risk ${formatNumber(risk.own_risk, 2)} · High-risk neighbor fraction ${formatNumber(risk.neighbor_high_risk_fraction, 2)} · ${risk.model_version}`),
    ),
  );
}

function neighborsPanel(risk, navigate, onKChange) {
  const select = el("select", { className: "select", "aria-label": "Number of similar patients" }, ...[3, 5, 10].map((value) => el("option", { value, selected: risk.neighbors.length === value }, String(value))));
  select.addEventListener("change", () => onKChange(Number(select.value)));
  const panel = el("section", { className: "panel panel-pad" },
    el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, "Similar patients"), el("p", {}, "Most similar by age, sex, smoking, vitals, labs, and conditions.")), select),
  );
  if (!risk.neighbors.length) {
    panel.append(el("div", { className: "empty-state" }, el("strong", {}, "No similar patients are available.")));
    return panel;
  }
  const rows = risk.neighbors.map((neighbor) => [
    el("button", { type: "button", className: "table-link", onclick: () => navigate(`#/patients/${encodeURIComponent(neighbor.patient_id)}`) }, neighbor.patient_id),
    `${formatNumber(neighbor.similarity * 100, 1)}%`, formatNumber(neighbor.own_risk, 2), badge(neighbor.high_risk ? "high" : "low"),
  ]);
  panel.append(el("div", { className: "scroll-x" }, table(["Patient ID", "Similarity", "Own risk", "High-risk"], rows)));
  return panel;
}

function vitalsPanels(vitals) {
  const heart = vitals.filter((item) => item.heart_rate !== null && item.heart_rate !== undefined).map((item) => ({ measured_at: item.measured_at, value: Number(item.heart_rate) }));
  const systolic = vitals.filter((item) => item.systolic_bp !== null && item.systolic_bp !== undefined).map((item) => ({ measured_at: item.measured_at, value: Number(item.systolic_bp) }));
  const diastolic = vitals.filter((item) => item.diastolic_bp !== null && item.diastolic_bp !== undefined).map((item) => ({ measured_at: item.measured_at, value: Number(item.diastolic_bp) }));
  const spo2 = vitals.filter((item) => item.oxygen_saturation !== null && item.oxygen_saturation !== undefined).map((item) => ({ measured_at: item.measured_at, value: Number(item.oxygen_saturation) }));
  const heartPanel = el("section", { className: "panel panel-pad chart-small" }, el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, "Heart rate"), el("p", {}, "Normal range 60–100 bpm"))));
  lineChart(heartPanel, [{ name: "Heart rate", values: heart }], { label: "Heart rate trend with normal range", range: { low: 60, high: 100 } });
  const pressurePanel = el("section", { className: "panel panel-pad chart-small" }, el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, "Blood pressure"), el("p", {}, "Systolic 90–130 · diastolic 60–85 mmHg"))));
  lineChart(pressurePanel, [
    { name: "Systolic", values: systolic, color: "var(--teal)" },
    { name: "Diastolic", values: diastolic, color: "var(--blue)" },
  ], { label: "Systolic and diastolic blood pressure trends", range: { low: 90, high: 130 } });
  const spoPanel = el("section", { className: "panel panel-pad chart-small" }, el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, "Oxygen saturation"), el("p", {}, "Expected at least 94%"))));
  lineChart(spoPanel, [{ name: "SpO2", values: spo2 }], { label: "Oxygen saturation trend with lower reference limit", range: { low: 94, high: Math.max(100, ...spo2.map((item) => item.value)) } });
  return [heartPanel, pressurePanel, spoPanel];
}

function labCards(labs) {
  const cards = Object.entries(labs).map(([name, values]) => {
    const ordered = [...values].reverse();
    const latest = values[0];
    const out = (latest.reference_low !== null && latest.value < latest.reference_low) || (latest.reference_high !== null && latest.value > latest.reference_high);
    return el("article", { className: "panel panel-pad stack" },
      el("div", { className: "cluster", style: { justifyContent: "space-between" } }, el("strong", {}, titleCase(name)), statusChip(out ? "Out of range" : "In range", out)),
      el("div", {}, el("strong", { className: "example-score" }, formatNumber(latest.value, 2)), el("span", { className: "muted small" }, ` ${latest.unit || ""}`)),
      sparkline(ordered.map((item) => item.value), `${name} trend`),
      el("span", { className: "muted small" }, `Latest ${formatDate(latest.measured_at)} · range ${latest.reference_low ?? "—"}–${latest.reference_high ?? "—"}`),
    );
  });
  return cards.length ? el("div", { className: "grid-3" }, ...cards) : el("div", { className: "empty-state" }, el("strong", {}, "No known lab measurements recorded."));
}

function renderDetail(data, patientId, navigate, signal) {
  const { summary, risk, history } = data;
  const root = el("div", {});
  root.append(el("nav", { className: "breadcrumb", "aria-label": "Breadcrumb" }, el("a", { href: "#/patients" }, "Patients"), " / ", summary.mrn || patientId));
  root.append(el("header", { className: "page-header" },
    el("div", {}, el("p", { className: "eyebrow" }, "Patient detail"), el("h1", {}, summary.mrn || "Patient"),
      el("div", { className: "chip-list" },
        el("span", { className: "chip" }, `${summary.age} years`), el("span", { className: "chip" }, titleCase(summary.sex)),
        el("span", { className: "chip" }, titleCase(summary.ethnicity)), el("span", { className: "chip" }, titleCase(summary.smoking_status)),
      ),
    ),
  ));

  const riskArea = el("section", { className: "panel panel-pad" }, el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, "Patient risk"), el("p", {}, "Persisted once when this page was opened."))));
  const outArea = el("div", {});
  const neighborArea = el("div", {});
  const updateRisk = (nextRisk) => {
    riskArea.replaceChildren(el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, "Patient risk"), el("p", {}, "Saved on page open; this recalculation is not persisted."))), riskSummary(nextRisk));
    outArea.replaceChildren(outOfRangePanel(nextRisk.out_of_range));
    neighborArea.replaceChildren(neighborsPanel(nextRisk, navigate, changeK));
  };
  const changeK = async (k) => {
    neighborArea.replaceChildren(el("div", { className: "skeleton", role: "status", "aria-label": "Loading similar patients", style: { height: "180px" } }));
    try {
      const nextRisk = await get(`/patients/${encodeURIComponent(patientId)}/risk?k=${k}&persist=false`, { signal, cache: false });
      if (!signal?.aborted) updateRisk(nextRisk);
    } catch (error) {
      if (!signal?.aborted) outArea.replaceChildren(el("div", { className: "error-state", role: "alert" }, el("strong", {}, "Risk refresh failed"), error.message, button("Retry", () => changeK(k), "button")));
    }
  };
  riskArea.append(riskSummary(risk));
  outArea.append(outOfRangePanel(risk.out_of_range));
  neighborArea.append(neighborsPanel(risk, navigate, changeK));

  const vitalsHeading = el("section", {}, el("div", { className: "section-heading" }, el("div", {}, el("h2", {}, "Vitals trends"), el("p", {}, "Most recent 40 daily records; shaded area indicates the configured reference range."))), el("div", { className: "grid-3" }, ...vitalsPanels(history.vitals)));
  const labsHeading = el("section", {}, el("div", { className: "section-heading" }, el("div", {}, el("h2", {}, "Key labs"), el("p", {}, "Most recent known lab readings with reference range context."))), labCards(history.labs));

  const conditionPanel = el("section", { className: "panel panel-pad" }, el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, "Conditions"), el("p", {}, "Latest 50 recorded conditions."))));
  conditionPanel.append(history.conditions.length ? el("div", { className: "chip-list" }, ...history.conditions.map((condition) => el("span", { className: "chip" }, condition.display, statusChip(condition.status, condition.status !== "resolved")))) : el("div", { className: "empty-state" }, "No conditions recorded."));
  const encounterPanel = el("section", { className: "panel panel-pad" }, el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, "Encounter timeline"), el("p", {}, "Most recent 15 visits."))));
  encounterPanel.append(history.encounters.length ? el("div", { className: "timeline" }, ...history.encounters.map((encounter) => el("div", { className: "timeline-item" },
    el("div", { className: "timeline-marker" }, "•"),
    el("div", {}, el("strong", {}, titleCase(encounter.encounter_type)), el("div", { className: "muted small" }, `${formatDateTime(encounter.started_at)}${encounter.ended_at ? ` · ended ${formatDate(encounter.ended_at)}` : ""}`), encounter.reason ? el("div", { className: "small" }, encounter.reason) : null),
  ))) : el("div", { className: "empty-state" }, "No encounters recorded."));
  const footer = el("p", { className: "muted small section-block" }, `Generated by ${risk.model_version} (rule-based baseline). This view was saved to risk_predictions.`);
  root.append(el("div", { className: "grid-2" }, riskArea, outArea), el("div", { className: "section-block" }, neighborArea), el("div", { className: "section-block stack" }, vitalsHeading, labsHeading), el("div", { className: "section-block grid-2" }, conditionPanel, encounterPanel), footer);
  return root;
}

export async function render(root, { signal, parts, navigate }) {
  const patientId = parts[1];
  if (!patientId) return navigate("#/patients");
  await withLoad(root, signal, async () => {
    const encodedId = encodeURIComponent(patientId);
    const [summary, risk, history] = await Promise.all([
      get(`/patients/${encodedId}/summary`, { signal }),
      get(`/patients/${encodedId}/risk?k=5&persist=true`, { signal, cache: false }),
      get(`/patients/${encodedId}/history`, { signal }),
    ]);
    return { summary, risk, history };
  }, (data) => renderDetail(data, patientId, navigate, signal));
}