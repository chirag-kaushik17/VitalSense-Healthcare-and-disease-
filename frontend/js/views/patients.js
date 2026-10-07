import { get } from "../api.js";
import { badge, button, copyButton, el, formatNumber, scoreBar, table, withLoad } from "../ui.js";

function hashFor(state) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) if (value !== "" && value !== null && value !== undefined && value !== 0 && value !== "asc") params.set(key, String(value));
  const query = params.toString();
  return `#/patients${query ? `?${query}` : ""}`;
}

function renderPatients(data, state, navigate) {
  const root = el("div", {});
  root.append(el("header", { className: "page-header" }, el("div", {},
    el("p", { className: "eyebrow" }, "Synthetic patient records"),
    el("h1", {}, "Patients"),
    el("p", {}, `${formatNumber(data.total)} matching records · Risk scores are the default top-five similarity baseline.`),
  )));

  const search = el("input", { className: "input", type: "search", placeholder: "Search MRN or patient ID", value: state.q, "aria-label": "Search by MRN or patient ID" });
  let timer;
  search.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => navigate(hashFor({ ...state, q: search.value, offset: 0 })), 260);
  });
  const sort = el("select", { className: "select", "aria-label": "Sort patients" },
    ...[["mrn", "MRN"], ["risk_score", "Risk score"], ["age", "Age"]].map(([value, label]) => el("option", { value, selected: state.sort === value }, label)),
  );
  sort.addEventListener("change", () => navigate(hashFor({ ...state, sort: sort.value, offset: 0 })));
  const order = el("select", { className: "select", "aria-label": "Sort order" },
    el("option", { value: "asc", selected: state.order === "asc" }, "Ascending"),
    el("option", { value: "desc", selected: state.order === "desc" }, "Descending"),
  );
  order.addEventListener("change", () => navigate(hashFor({ ...state, order: order.value, offset: 0 })));

  const toolbar = el("div", { className: "toolbar" },
    el("label", { className: "field field-search" }, "Search", search),
    el("label", { className: "field" }, "Sort by", sort),
    el("label", { className: "field" }, "Order", order),
  );

  const filterPanel = el("section", { className: "panel panel-pad" },
    el("div", { className: "cluster" },
      el("strong", { className: "small" }, "Sex"),
      el("div", { className: "segmented", role: "group", "aria-label": "Filter by sex" }, ...[
        ["", "All"], ["female", "Female"], ["male", "Male"], ["unknown", "Unknown"],
      ].map(([value, label]) => button(label, () => navigate(hashFor({ ...state, sex: value, offset: 0 })), `segment${state.sex === value ? " active" : ""}`))),
      el("strong", { className: "small" }, "Risk"),
      el("div", { className: "segmented", role: "group", "aria-label": "Filter by risk category" }, ...[
        ["", "All"], ["low", "Low"], ["moderate", "Moderate"], ["high", "High"],
      ].map(([value, label]) => button(label, () => navigate(hashFor({ ...state, category: value, offset: 0 })), `segment${state.category === value ? " active" : ""}`))),
    ),
  );
  for (const segment of filterPanel.querySelectorAll(".segment")) segment.setAttribute("aria-pressed", String(segment.classList.contains("active")));

  if (!data.items.length) {
    root.append(toolbar, filterPanel, el("section", { className: "panel panel-pad section-block" }, el("div", { className: "empty-state" }, el("strong", {}, "No patients match these filters"), el("span", {}, "Adjust the search or clear a filter to see more records."))));
    return root;
  }

  const rows = data.items.map((item) => [
    el("div", { className: "cluster" }, el("button", { type: "button", className: "table-link", onclick: () => navigate(`#/patients/${encodeURIComponent(item.id)}`) }, item.mrn || "—"), copyButton(item.mrn)),
    formatNumber(item.age), item.sex,
    formatNumber(item.condition_count), item.smoking_status || "unknown",
    scoreBar(item.risk_score, item.risk_category), badge(item.risk_category),
  ]);
  const start = data.total ? state.offset + 1 : 0;
  const end = Math.min(state.offset + state.limit, data.total);
  const pager = el("div", { className: "pager" },
    el("span", {}, `Showing ${formatNumber(start)}–${formatNumber(end)} of ${formatNumber(data.total)}`),
    el("div", { className: "cluster" },
      button("Previous", () => navigate(hashFor({ ...state, offset: Math.max(0, state.offset - state.limit) })), "button"),
      button("Next", () => navigate(hashFor({ ...state, offset: state.offset + state.limit })), "button"),
    ),
  );
  pager.querySelectorAll("button")[0].disabled = state.offset <= 0;
  pager.querySelectorAll("button")[1].disabled = end >= data.total;
  root.append(toolbar, filterPanel, el("section", { className: "panel panel-pad section-block" },
    el("div", { className: "scroll-x" }, table(["MRN", "Age", "Sex", "Conditions", "Smoking", "Risk score", "Category"], rows)), pager,
  ));
  return root;
}

export async function render(root, { signal, params, navigate }) {
  const state = {
    q: params.get("q") || "",
    sex: params.get("sex") || "",
    category: params.get("category") || "",
    sort: ["risk_score", "age", "mrn"].includes(params.get("sort")) ? params.get("sort") : "mrn",
    order: params.get("order") === "desc" ? "desc" : "asc",
    limit: 25,
    offset: Math.max(0, Number.parseInt(params.get("offset") || "0", 10) || 0),
  };
  const query = new URLSearchParams({ sort: state.sort, order: state.order, limit: String(state.limit), offset: String(state.offset) });
  if (state.q) query.set("q", state.q);
  if (state.sex) query.set("sex", state.sex);
  if (state.category) query.set("category", state.category);
  await withLoad(root, signal, () => get(`/patients/search?${query}`, { signal }), (data) => renderPatients(data, state, navigate));
}