# Employee Appraisal Management - Zoho Catalyst

This version converts the original Lovable/TanStack Start project into a standard **React + Vite + Node.js/Express** application suitable for **Zoho Catalyst AppSail**.

## What was changed

- Removed TanStack Start, Nitro, TanStack Router, and Lovable-specific Vite configuration.
- Converted the application source from `.ts` / `.tsx` to `.js` / `.jsx`.
- Added a normal Vite React entry point (`index.html` -> `src/main.jsx`).
- Added a small Node.js/Express server in `server/index.cjs`.
- Express serves the Vite `dist` folder and provides SPA fallback, so `/` and `/sheet` work directly from Catalyst without a 404.
- Catalyst AppSail configuration is included in `app-config.json`.
- Catalyst's `X_ZOHO_CATALYST_LISTEN_PORT` is used automatically; local development falls back to port 9000.
- Appraisal data and audit history are retained in browser `localStorage` so a browser refresh does not reset the demo data.
- Existing spreadsheet behavior, column filters, numeric operators, bulk edit, compensation audit trail, employee history, and current manager rating are preserved.

## Compensation fields

The sheet contains:

- Employee ID
- Employee Name
- Department
- Designation
- Manager
- Current CTC
- Target Performance Bonus
- Performance Bonus
- Retention Bonus
- Hike Amount
- Manager Rating
- Status
- Bonus Payout %
- Total Payout
- Hike %
- Revised CTC

Every visible column has a filter. Numeric columns support:

- Greater than
- Greater than or equal
- Less than
- Less than or equal
- Equals
- Between

Text fields support Contains, Equals, and Starts with. Enum fields support multi-select filtering.

## Local development

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

To test the same Node.js server used by Catalyst:

```bash
npm run build
npm start
```

Then open `http://localhost:9000`.

## Catalyst AppSail

The included `app-config.json` uses:

- Stack: `node20`
- Build path: `.`
- Startup command: `node server/index.cjs`
- Pre-serve/deploy preparation: `npm install --omit=dev && npm run build`

The Express server listens on `X_ZOHO_CATALYST_LISTEN_PORT`, which is the port Catalyst provides to AppSail.

Initialize/add the AppSail service from the Catalyst project, point its build path to this project directory, select Node.js 20, and use:

```text
node server/index.cjs
```

Then deploy the AppSail service.

## Important production note

The current project is deployment-ready and keeps edits/audit history in the browser. That is suitable for a prototype or single-user workflow. For a multi-user HR application, the next step should be replacing the browser store with a Catalyst Data Store backend so employee compensation and audit records are shared and persisted centrally.
