import { get } from "../api.js";
import { el, badge, button, formatNumber, metric, withLoad } from "../ui.js";

function heading(title, subtitle = "") {
  return el("div", { className: "section-heading" }, el("div", {}, el("h2", {}, title), subtitle ? el("p", {}, subtitle) : null));
}

function heroLine() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 350 110");
  svg.setAttribute("class", "ecg-art");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "A pulse line representing the patient monitoring workflow");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", "M4 56h74l20-30 27 62 27-53 25 33 18-12h151");
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "4");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  line.setAttribute("class", "ecg-line");
  svg.append(line);
  return svg;
}

function countUp(target, value, signal) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    target.textContent = formatNumber(value);
    return;
  }
  const started = performance.now();
  const duration = 650;
  const tick = (now) => {
    if (signal?.aborted) return;
    const progress = Math.min(1, (now - started) / duration);
    target.textContent = formatNumber(Math.round(Number(value) * (1 - (1 - progress) ** 3)));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderOverview(data, navigate, signal) {
  const { stats, examples } = data;
  const hero = el("section", { className: "hero" },
    el("div", {},
      el("p", { className: "eyebrow" }, "A transparent risk baseline"),
      el("h1", {}, "Spot high-risk patients early, and see exactly why."),
      el("p", { className: "hero-copy" }, "VitalSense scores patient risk by combining a patient's own measurements with the outcomes of the most similar patients. Every score comes with its evidence."),
      el("div", { className: "hero-actions" },
        el("a", { className: "button button-primary", href: "#/dashboard" }, "Explore the results"),
        button("Try an example patient", () => {
          const example = examples.high || examples.moderate || examples.low;
          if (example?.patient_id) navigate(`#/patients/${encodeURIComponent(example.patient_id)}`);
        }, "button"),
      ),
    ), heroLine(),
  );

  const metrics = [
    ["Patients", stats.patient_count], ["Encounters", stats.encounter_count], ["Conditions", stats.condition_count],
    ["Lab results", stats.lab_count], ["Vital readings", stats.vital_count], ["Risk predictions logged", stats.prediction_log_count],
  ];
  const metricStrip = el("section", { className: "section-block", "aria-label": "Live dataset counts" },
    heading("The dataset, live", "Counts are read from the current PostgreSQL database."),
    el("div", { className: "grid-3" }, ...metrics.map(([label, value]) => {
      const card = metric(label, "0", "Current database");
      countUp(card.querySelector(".metric-value"), value, signal);
      return card;
    })),
  );

  const reasons = [
    ["Early identification", "Out-of-range signals and risk among similar patients can help teams prioritize a closer review."],
    ["Explainable by design", "Each score exposes the measurements and neighboring patients that contribute to it."],
    ["Sparse-data aware", "Missing measurements are imputed for similarity; available clinical signals remain visible in the explanation."],
    ["Built to be audited", "Group-level breakdowns are descriptive; a dedicated fairness audit remains planned for Phase 3."],
  ];
  const why = el("section", { className: "section-block" }, heading("Why this matters", "A review aid, not a clinical decision."),
    el("div", { className: "grid-4" }, ...reasons.map(([title, copy], index) => el("article", { className: "panel why-card" },
      el("div", { className: "icon-wrap" }, el("span", {}, ["01", "02", "03", "04"][index])),
      el("h3", {}, title), el("p", {}, copy),
    ))),
  );

  const steps = [
    ["Synthea data", "Synthetic clinical records"],
    ["PostgreSQL", "Six relational tables"],
    ["Similarity", "Feature vectors + cosine"],
    ["Risk + evidence", "Score, neighbors, signals"],
  ];
  const how = el("section", { className: "section-block" }, heading("How it works", "A small, inspectable pipeline."),
    el("div", { className: "panel panel-pad steps" }, ...steps.map(([title, copy], index) => el("div", { className: "step" },
      el("div", { className: "step-icon", "aria-hidden": "true" }, String(index + 1)),
      el("strong", {}, title), el("span", {}, copy),
    ))),
  );

  const exampleCards = ["low", "moderate", "high"].map((category) => {
    const example = examples[category];
    if (!example) return el("article", { className: "panel example-card example-unavailable", "aria-label": `${category} example not available` }, badge(category), el("strong", {}, category === "high" ? "No high-risk patient in this sample" : "No example available"), el("span", { className: "mrn" }, "Scores reflect this seeded dataset as-is."));
    return el("article", {
      className: "panel example-card",
      role: "link",
      tabindex: "0",
      "aria-label": `Open ${category} risk patient ${example.mrn || example.patient_id}`,
      onclick: () => navigate(`#/patients/${encodeURIComponent(example.patient_id)}`),
      onkeydown: (event) => { if (event.key === "Enter" || event.key === " ") navigate(`#/patients/${encodeURIComponent(example.patient_id)}`); },
    }, badge(category), el("strong", { className: "example-score" }, Number(example.risk_score).toFixed(2)), el("span", { className: "mrn" }, `MRN ${example.mrn || "not available"}`));
  });
  const featured = el("section", { className: "section-block" }, heading("Featured examples", "Open a record to inspect its measurements, neighbors, and history."), el("div", { className: "grid-3" }, ...exampleCards));

  const statusCard = el("section", { className: "section-block panel status-card" },
    el("div", {}, el("strong", {}, "Phase 1 baseline"), el("p", {}, "Rule-based and unvalidated against real outcomes. Phase 2 adds a graph neural network; Phase 3 adds a fairness audit.")),
    badge("moderate"),
  );
  return el("div", {}, hero, metricStrip, why, how, featured, statusCard);
}

export async function render(root, { signal, navigate }) {
  await withLoad(root, signal, async () => {
    const [stats, examples] = await Promise.all([
      get("/stats/overview", { signal }),
      get("/demo/examples", { signal }),
    ]);
    return { stats, examples };
  }, (data) => renderOverview(data, navigate, signal));
}