import { get } from "../api.js";
import { erd } from "../erd.js";
import { badge, el, formatNumber, table, withLoad } from "../ui.js";

function heading(title, subtitle = "") {
  return el("div", { className: "section-heading" }, el("div", {}, el("h2", {}, title), subtitle ? el("p", {}, subtitle) : null));
}

function sampleTable(data, tableMeta) {
  if (!data.items.length) return el("div", { className: "empty-state" }, el("strong", {}, "This table has no rows."));
  const keys = tableMeta.columns.map((column) => column.name);
  const rows = data.items.map((item) => keys.map((key) => {
    const value = item[key];
    return value && typeof value === "object" ? JSON.stringify(value) : value === null || value === undefined ? "—" : String(value);
  }));
  return el("div", { className: "scroll-x" }, table(keys, rows));
}

function detailView(tableMeta, metadata, dataQuality, signal) {
  const root = el("div", {});
  root.append(el("nav", { className: "breadcrumb", "aria-label": "Breadcrumb" }, el("a", { href: "#/database" }, "Database"), " / ", tableMeta.name));
  root.append(el("header", { className: "page-header" }, el("div", {},
    el("p", { className: "eyebrow" }, "Data dictionary"), el("h1", {}, tableMeta.name), el("p", {}, tableMeta.description),
  ), el("span", { className: "chip tabular" }, `${formatNumber(tableMeta.row_count)} rows · ${tableMeta.columns.length} columns`)));

  const dictionaryRows = tableMeta.columns.map((column) => [
    column.name,
    column.type,
    column.nullable ? "Yes" : "No",
    el("div", { className: "cluster" }, column.primary_key ? el("span", { className: "chip" }, "PK") : null, column.foreign_key ? el("span", { className: "chip" }, `FK ${column.foreign_key}`) : null),
    column.description,
  ]);
  const dictionary = el("section", { className: "panel panel-pad section-block" }, heading("Columns", "Physical schema and confirmed source lineage."), el("div", { className: "scroll-x dictionary" }, table(["Column", "Type", "Nullable", "Key", "Description"], dictionaryRows)));

  const indexPanel = el("section", { className: "panel panel-pad" }, heading("Indexes", "Inspected from the active PostgreSQL schema."));
  const indexes = tableMeta.indexes || [];
  indexPanel.append(indexes.length ? el("div", { className: "scroll-x" }, table(["Name", "Columns", "Unique"], indexes.map((index) => [index.name, (index.column_names || []).join(", "), index.unique ? "Yes" : "No"]))) : el("p", { className: "muted small" }, "No indexes found."));

  const sampleRoot = el("div", {});
  const rowCount = el("select", { className: "select", "aria-label": "Sample row count" }, el("option", { value: "5", selected: true }, "Show 5 rows"), el("option", { value: "10" }, "Show 10 rows"));
  const loadSample = (limit) => withLoad(sampleRoot, signal, () => get(`/meta/tables/${encodeURIComponent(tableMeta.name)}/sample?limit=${limit}`, { signal, cache: false }), (sample) => sampleTable(sample, tableMeta));
  rowCount.addEventListener("change", () => loadSample(Number(rowCount.value)));
  const samplePanel = el("section", { className: "panel panel-pad" }, el("div", { className: "panel-title" }, el("div", {}, el("h2", {}, "Live sample"), el("p", {}, "Rows are read from PostgreSQL; values are not edited here.")), rowCount), sampleRoot);
  loadSample(5);

  const lineage = el("section", { className: "panel panel-pad" }, heading("Source & lineage"), el("p", {}, tableMeta.source));
  const quality = el("section", { className: "panel panel-pad" }, heading("Data quality notes"),
    el("p", { className: "small" }, `${formatNumber(dataQuality.patients_without_vitals)} patients have no vital rows (${formatNumber(dataQuality.pct_labs_with_reference_range, 1)}% of lab rows have a configured reference range).`),
    el("p", { className: "muted small" }, "Missing measures are not filled in the stored data; feature imputation is limited to similarity calculations."),
  );
  root.append(dictionary, el("div", { className: "section-block grid-2" }, indexPanel, lineage), samplePanel, quality);
  return root;
}

function databaseOverview(data, navigate) {
  const { metadata, overview } = data;
  const root = el("div", {});
  root.append(el("header", { className: "page-header" }, el("div", {}, el("p", { className: "eyebrow" }, "Data foundation"), el("h1", {}, "Database"), el("p", {}, "Six PostgreSQL tables hold the synthetic patient record and the audit trail of every risk score."))));
  const countMap = {
    patients: overview.patient_count,
    encounters: overview.encounter_count,
    conditions: overview.condition_count,
    lab_results: overview.lab_count,
    vitals: overview.vital_count,
    risk_predictions: overview.prediction_log_count,
  };
  root.append(el("div", { className: "grid-3" }, ...metadata.tables.map((item) => el("article", { className: "metric" }, el("span", { className: "metric-label" }, item.name), el("strong", { className: "metric-value" }, formatNumber(countMap[item.name] ?? item.row_count)), el("span", { className: "metric-detail" }, `${item.columns.length} columns`)))));
  root.append(el("section", { className: "section-block" }, heading("Entity relationships", "Each clinical and prediction record belongs to one patient; deletes cascade to dependent rows."), erd(), el("div", { className: "cluster small muted", style: { marginTop: "10px" } }, el("span", { className: "chip" }, "many-to-one · patient_id"), el("span", { className: "chip" }, "ON DELETE CASCADE"))));

  const cards = metadata.tables.map((item) => el("a", { className: "panel table-card", href: `#/database/${encodeURIComponent(item.name)}` },
    el("div", { className: "cluster", style: { justifyContent: "space-between" } }, el("h3", {}, item.name), el("span", { className: "chip tabular" }, `${formatNumber(item.row_count)} rows`)),
    el("p", {}, item.description), el("span", { className: "muted small" }, `${item.columns.length} columns · ${item.source.split(":")[0]}`),
  ));
  root.append(el("section", { className: "section-block" }, heading("Tables", "Select a table to inspect its schema, indexes, lineage, and sample rows."), el("div", { className: "grid-3" }, ...cards)));

  root.append(el("section", { className: "section-block panel panel-pad" }, heading("Data pipeline", "Observations are divided into wide daily vitals and numeric lab rows."),
    el("div", { className: "pipeline" },
      el("div", { className: "pipeline-step" }, el("strong", {}, "Synthea CSVs"), el("span", {}, "patients · encounters · conditions · observations")),
      el("span", { className: "pipeline-arrow", "aria-hidden": "true" }, "→"),
      el("div", { className: "pipeline-step" }, el("strong", {}, "scripts/seed.py"), el("span", {}, "parse · map · bulk insert")),
      el("span", { className: "pipeline-arrow", "aria-hidden": "true" }, "→"),
      el("div", { className: "pipeline-step" }, el("strong", {}, "PostgreSQL"), el("span", {}, "6 normalized tables")),
    ),
  ));
  return root;
}

export async function render(root, { signal, parts }) {
  await withLoad(root, signal, async () => {
    const [metadataResponse, overview] = await Promise.all([get("/meta/tables", { signal }), get("/stats/overview", { signal })]);
    const metadata = metadataResponse.tables ? metadataResponse : { tables: metadataResponse };
    const dataQuality = overview.data_quality || { patients_without_vitals: 0, pct_labs_with_reference_range: 0 };
    if (parts[1]) {
      const tableMeta = metadata.tables.find((item) => item.name === parts[1]);
      if (!tableMeta) throw new Error(`Unknown table: ${parts[1]}`);
      return { detail: true, view: detailView(tableMeta, metadata, dataQuality, signal) };
    }
    return { detail: false, view: databaseOverview({ metadata, overview }, () => { location.hash = "#/database"; }) };
  }, (data) => data.view);
}