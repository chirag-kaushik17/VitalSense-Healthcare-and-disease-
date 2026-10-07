# VitalSense Frontend

The frontend is plain HTML, CSS, and JavaScript ES modules. It has no build step, package manager, CDN, or external assets, and is served by FastAPI from `/ui/` on the same origin as the API.

## Run

Set `DATABASE_URL`, start PostgreSQL and the backend, then open:

```text
http://127.0.0.1:8000/
```

From the project root:

```powershell
$env:DATABASE_URL = 'postgresql+psycopg2://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/vitalsense'
cd backend
uvicorn app.main:app --reload
```

## Pages

- `#/` Overview: dataset counts, method summary, and available demo examples.
- `#/dashboard` Results Dashboard: risk distributions, group summaries, and prediction log.
- `#/patients` Patients: searchable, filterable, sortable patient directory.
- `#/patients/<id>` Patient detail: score evidence, neighbors, measurements, labs, conditions, and encounters.
- `#/database` Database: table relationships, counts, lineage, and data quality notes.
- `#/database/<table>` Table detail: dictionary, indexes, and a live sample.
- `#/about` About: scoring method, reference ranges, limitations, and roadmap.

## Folder map

- `index.html`: app entry point and relative stylesheet/module references.
- `css/`: design tokens, shared responsive layout, reusable components, and page-specific layout.
- `js/main.js`: shell, hash router, theme state, and page initialization.
- `js/api.js`: same-origin API base, fetch cache, and invalidation.
- `js/ui.js`: safe DOM helpers, formatting, loading/error/empty states, and status UI.
- `js/charts.js` and `js/erd.js`: accessible inline-SVG charts and database diagram.
- `js/views/`: one ES module per page.
- `assets/`: local SVG favicon.

## Add a page

1. Add `js/views/<page>.js` and export `async function render(root, context)`; use `context.signal` for cancellable API calls and `withLoad` for loading, retry, and error states.
2. Add the module import and route mapping in `js/main.js`, then add the matching navigation entry if it is a top-level page.
3. Add page styles to `css/pages.css`; keep assets relative to `/ui/` and navigate with a hash such as `#/new-page`.

## Add a chart

Add a function to `js/charts.js` that builds SVG nodes with the SVG namespace, adds `role="img"` and a useful `aria-label`, and provides visible text context in the page. Use `<title>` on interactive SVG marks for hover/focus details. Keep data formatting and DOM insertion in the shared UI helpers; never interpolate API values into `innerHTML`.

## API endpoints

The UI reads `GET /stats/overview`, `GET /stats/results`, `GET /patients/search`, `GET /patients/{id}/summary`, `GET /patients/{id}/history`, `GET /patients/{id}/risk`, `GET /demo/examples`, `GET /meta/tables`, `GET /meta/tables/{name}/sample`, and `GET /meta/ranges`. Patient risk is persisted only on initial patient detail load; neighbor-count recalculations use `persist=false`.