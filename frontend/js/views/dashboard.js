import { get, invalidate } from "../api.js";
import { donutChart, histogram, horizontalBars, scatter, stackedBar } from "../charts.js";
import { badge, button, el, formatDateTime, formatNumber, metric, table, withLoad } from "../ui.js";

const GROUPS = ["Age", "Sex", "Smoking", "Ethnicity"];

function section(title, subtitle = "") {
  return el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, title), subtitle ? el("p", {}, subtitle) : null));
}

function summaryTiles(stats, results) {
  const total = stats.patient_count || 0;
  const pct = (value) => `${formatNumber(total ? value / total * 100 : 0, 1)}%`;
  return el("div", { className: "dashboard-summary" },
    metric("Patients", formatNumber(total)),
    metric("High risk", pct(stats.category_counts.high), `${formatNumber(stats.category_counts.high)} patients`),
    metric("Moderate risk", pct(stats.category_counts.moderate), `${formatNumber(stats.category_counts.moderate)} patients`),
    metric("Average risk", formatNumber(stats.avg_risk, 2), stats.model_version),
    metric("Out-of-range", pct(results.patients_with_out_of_range || 0), `${formatNumber(results.patients_with_out_of_range || 0)} patients`),
  );
}

function categoryLegend() {
  return el("div", { className: "chart-legend", "aria-label": "Risk categories" },
    ...[["low", "Low"], ["moderate", "Moderate"], ["high", "High"]].map(([key, label]) => el("span", { className: "legend-item" }, el("span", { className: "legend-dot", style: { color: `var(--${key})` } }), label)),
  );
}

function renderGroup(parent, results, key) {
  parent.replaceChildren();
  const map = { Age: results.by_age, Sex: results.by_sex, Smoking: results.by_smoking, Ethnicity: results.by_ethnicity };
  stackedBar(parent, map[key] || {});
  if (!Object.values(map[key] || {}).some((item) => item.n)) parent.append(el("p", { className: "muted small" }, "No groups available."));
}

function renderDashboard(data, signal, navigate) {
  const { stats, results } = data;
  const groupPanel = el("section", { className: "panel panel-pad" }, section("Risk by group", "Average risk and share of low, moderate, and high scores."));
  const groupTabs = el("div", { className: "segmented", role: "group", "aria-label": "Risk group breakdown" });
  const groupBody = el("div", { className: "stack" });
  let selectedGroup = "Age";
  const selectGroup = (name) => {
    selectedGroup = name;
    for (const tab of groupTabs.querySelectorAll("button")) tab.setAttribute("aria-pressed", String(tab.textContent === selectedGroup));
    renderGroup(groupBody, results, selectedGroup);
    if (selectedGroup === "Ethnicity") groupBody.append(el("p", { className: "notice notice-warning" }, "Descriptive only, small groups, not a fairness audit — the audit is planned for Phase 3."));
  };
  for (const name of GROUPS) groupTabs.append(button(name, () => selectGroup(name), "segment"));
  groupPanel.append(groupTabs, groupBody, categoryLegend());
  selectGroup(selectedGroup);

  const categoryPanel = el("section", { className: "panel panel-pad chart-box" }, section("Risk categories", "Share of patients by score threshold."));
  donutChart(categoryPanel, stats.category_counts);
  categoryPanel.append(categoryLegend());

  const histogramPanel = el("section", { className: "panel panel-pad chart-box" }, section("Score distribution", "Ten equal-width score bins; dashed markers show 0.33 and 0.66."));
  histogram(histogramPanel, results.score_histogram);

  const outOfRangePanel = el("section", { className: "panel panel-pad" }, section("Most common out-of-range measures", "Percent is among patients with a recorded value for that measure."));
  horizontalBars(outOfRangePanel, results.out_of_range_frequency.slice(0, 8));

  const conditionRows = results.top_conditions.map((item) => [
    item.display,
    formatNumber(item.patients),
    el("div", { className: "cluster" }, el("div", { className: "score-track mini-bar" }, el("div", { className: "score-fill moderate", style: { width: `${Math.max(0, Math.min(100, item.avg_risk * 100))}%` } })), el("span", {}, formatNumber(item.avg_risk, 2))),
  ]);
  const conditionsPanel = el("section", { className: "panel panel-pad" }, section("Top active conditions", "Patient counts are distinct by condition display."), conditionRows.length ? el("div", { className: "scroll-x" }, table(["Condition", "Patients", "Average risk"], conditionRows)) : el("p", { className: "muted small" }, "No active conditions."));

  const scatterPanel = el("section", { className: "panel panel-pad" }, section("How the score is built", "Score = 0.6 × own risk + 0.4 × high-risk neighbor fraction."));
  scatter(scatterPanel, results.score_components_sample);
  scatterPanel.append(el("p", { className: "muted small" }, "Each point is a deterministic sample of patients. Neighbor fraction is based on the five most similar patients."));

  const topRows = results.top_risk_patients.map((item) => [
    el("button", { type: "button", className: "table-link", onclick: () => navigate(`#/patients/${encodeURIComponent(item.patient_id)}`) }, item.mrn || item.patient_id),
    String(item.age), item.sex,
    el("div", { className: "mini-bar" }, el("div", { className: "score-track" }, el("div", { className: `score-fill ${item.risk_category}`, style: { width: `${item.risk_score * 100}%` } })), el("span", { className: "small tabular" }, formatNumber(item.risk_score, 2))),
    badge(item.risk_category), item.top_out_of_range.join(", ") || "—",
  ]);
  const topPanel = el("section", { className: "panel panel-pad" }, section("Top 10 highest-risk patients", "Select a patient to open the evidence view."), topRows.length ? el("div", { className: "scroll-x" }, table(["MRN", "Age", "Sex", "Score", "Category", "Main out-of-range"], topRows)) : el("p", { className: "muted small" }, "No patients available."));

  const predictionRows = results.recent_predictions.map((item) => [
    item.mrn || item.patient_id,
    formatNumber(item.risk_score, 2),
    badge(item.risk_category),
    item.model_version,
    formatDateTime(item.predicted_at),
  ]);
  const predictionPanel = el("section", { className: "panel panel-pad" }, section("Recent predictions log", "Persisted requests are retained as an audit trail."), predictionRows.length ? el("div", { className: "scroll-x" }, table(["MRN", "Score", "Category", "Model", "Predicted at"], predictionRows)) : el("p", { className: "empty-state" }, "No predictions have been persisted yet."));

  const refreshButton = button("Refresh data", async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = "Refreshing…";
    invalidate();
    try {
      const refreshedResults = await get("/stats/results?refresh=true", { signal, cache: false });
      const refreshedOverview = await get("/stats/overview", { signal, cache: false });
      const next = renderDashboard({ stats: refreshedOverview, results: refreshedResults }, signal, navigate);
      document.querySelector("#page-content")?.replaceChildren(next);
    } catch (error) {
      refreshButton.disabled = false;
      refreshButton.textContent = "Retry refresh";
      refreshButton.title = error instanceof Error ? error.message : "Refresh failed";
    }
  }, "button");

  return el("div", {},
    el("header", { className: "page-header" },
      el("div", {}, el("p", { className: "eyebrow" }, "Population view"), el("h1", {}, "Results Dashboard"), el("p", {}, `Model ${stats.model_version} · Last computed ${new Date().toLocaleTimeString()}`)),
      refreshButton,
    ),
    summaryTiles(stats, results),
    el("div", { className: "section-block grid-2" }, categoryPanel, histogramPanel),
    el("div", { className: "section-block grid-2" }, groupPanel, outOfRangePanel),
    el("div", { className: "section-block grid-2" }, conditionsPanel, scatterPanel),
    el("div", { className: "section-block stack" }, topPanel, predictionPanel),
  );
}

export async function render(root, { signal, navigate }) {
  await withLoad(root, signal, async () => {
    const [stats, results] = await Promise.all([
      get("/stats/overview", { signal }),
      get("/stats/results", { signal }),
    ]);
    return { stats, results };
  }, (data) => renderDashboard(data, signal, navigate));
}