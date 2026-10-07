import { get } from "../api.js";
import { badge, el, formatNumber, table, withLoad } from "../ui.js";

function heading(title, subtitle = "") {
  return el("div", { className: "section-heading" }, el("div", {}, el("h2", {}, title), subtitle ? el("p", {}, subtitle) : null));
}

function renderAbout({ overview, ranges }) {
  const weights = overview.weights;
  const thresholds = overview.thresholds;
  const root = el("div", {});
  root.append(el("header", { className: "page-header" }, el("div", {}, el("p", { className: "eyebrow" }, "Method and scope"), el("h1", {}, "About VitalSense"), el("p", {}, "A transparent similarity-based baseline over synthetic Synthea records."))));

  const method = el("section", { className: "panel panel-pad" }, heading("Method", "Each step is intentionally inspectable."),
    el("ol", { className: "method-list" },
      el("li", {}, el("strong", {}, "Build patient features."), " Age, sex, smoking status, latest available vitals and key labs, plus active condition indicators."),
      el("li", {}, el("strong", {}, "Scale the numeric feature vector."), " StandardScaler centers and scales each feature before similarity is calculated."),
      el("li", {}, el("strong", {}, "Find neighbors."), " Cosine similarity ranks the other patients; the default risk score uses the five nearest records."),
      el("li", {}, el("strong", {}, "Calculate own risk."), " Out-of-range available measurements contribute their fraction of available measures; matched condition groups add 0.08 each, capped at 0.25."),
      el("li", {}, el("strong", {}, "Combine both terms."), `risk_score = ${weights.own_risk} × own_risk + ${weights.neighbor_fraction} × high-risk neighbor fraction.`),
    ),
    el("div", { className: "notice" }, `High-risk neighbors have own risk ≥ ${formatNumber(thresholds.high_risk_label, 2)}. Categories: low < ${formatNumber(thresholds.moderate, 2)}, moderate < ${formatNumber(thresholds.high, 2)}, high ≥ ${formatNumber(thresholds.high, 2)}.`),
  );

  const vitalRows = Object.entries(ranges.vitals).map(([name, range]) => [name, range.low ?? "—", range.high ?? "—"]);
  const labRows = ranges.labs.map((lab) => [lab.name, lab.code, lab.low ?? "—", lab.high ?? "—"]);
  const references = el("section", { className: "panel panel-pad" }, heading("Reference ranges", "Configured thresholds used by the baseline explanation."),
    el("h3", {}, "Vitals"), el("div", { className: "scroll-x" }, table(["Measure", "Low", "High"], vitalRows)),
    el("h3", { style: { marginTop: "20px" } }, "Known labs"), el("div", { className: "scroll-x" }, table(["Measure", "LOINC", "Low", "High"], labRows)),
  );

  const limitations = el("section", { className: "panel panel-pad" }, heading("Limitations"),
    el("ul", {},
      el("li", {}, "Synthetic, 2020-era Synthea sample data; no live patient records."),
      el("li", {}, "Rule-based heuristic; no outcome labels and no clinical validation."),
      el("li", {}, "Similarity does not establish causality or predict a clinical outcome."),
      el("li", {}, "Not for clinical use or treatment decisions."),
    ),
    el("p", {}, "Risk category thresholds and the high-risk neighbor label are sourced from the current API response."),
  );

  const roadmap = el("section", { className: "panel panel-pad" }, heading("Roadmap"),
    el("div", { className: "roadmap" },
      el("article", { className: "roadmap-step" }, badge("low"), el("h3", {}, "Phase 1 · Baseline"), el("p", {}, "Transparent similarity scoring, evidence and audit log.")),
      el("article", { className: "roadmap-step" }, el("span", { className: "chip" }, "Planned"), el("h3", {}, "Phase 2 · Graph"), el("p", {}, "Inductive GraphSAGE model with a Neo4j patient/clinical graph.")),
      el("article", { className: "roadmap-step" }, el("span", { className: "chip" }, "Planned"), el("h3", {}, "Phase 3 · Audit"), el("p", {}, "Fairness review and calibration before any consideration of real-world use.")),
    ),
  );

  const stack = el("section", { className: "panel panel-pad" }, heading("Technology"), el("div", { className: "chip-list" }, ...["FastAPI", "PostgreSQL", "SQLAlchemy", "pandas", "scikit-learn", "Vanilla JavaScript"].map((item) => el("span", { className: "chip" }, item))));
  root.append(el("div", { className: "stack" }, method, references, el("div", { className: "grid-2" }, limitations, roadmap), stack));
  return root;
}

export async function render(root, { signal }) {
  await withLoad(root, signal, async () => {
    const [overview, ranges] = await Promise.all([get("/stats/overview", { signal }), get("/meta/ranges", { signal })]);
    return { overview, ranges };
  }, renderAbout);
}