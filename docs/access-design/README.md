# Access screen on Catalyst — developer guide (v5)

Goes with **Access_Screen_v5.html** (HR Operations → Access). One Advanced I/O function,
`accessapi` (Node.js), plus `accessCore.js` — the access rules — which you **copy into every
other function** (budgetapi, appraisalapi, delegation, letters…) so they all decide access the same way.

**No AI is used anywhere here** — no credits. Quick check runs in the browser.

How a person's access is decided:
1. **Locked rule** — HR Operations screens are HR Admin only; fixed actions can't change.
2. **Personal override** — AccessOverride, until its end date.
3. **Role setting** — RoleScreen / RoleAction / FieldAccess.

How a person gets a role: **Catalyst role** (HR Admin, and any role HR adds on the screen)
→ else **Delegation** for the active cycle (Appraiser Tech ED → Tech ED, Comp Manager → Comp Manager)
→ else no access. Nobody is added by hand.

Tables store **keys** (`appraisalSheet`, `hikeAmt`), never labels.

---

## 1. Tables to create (Data Store)

Catalyst adds ROWID, CREATORID, CREATEDTIME, MODIFIEDTIME itself.

### AccessCatalog — the list of screens, actions and fields
| Column | Type | Notes |
|---|---|---|
| item_type | Var Char (10) | `screen` · `action` · `field` |
| item_key | Var Char (50) | e.g. `bellCurve` — never change it once used |
| label | Var Char (120) | what users see |
| grp | Var Char (60) | e.g. Compensation, HR Operations, Editing |
| hr_only | Boolean | screens: HR Admin only, locked |
| fixed_note | Var Char (120) | actions: if filled, the action can't be changed (e.g. "Upload only") |
| note | Var Char (200) | small text under the name |
| field_kind | Var Char (10) | fields: `master` · `input` · `upload` · `calc` · `pair` |
| deps | Text | calc fields: keys it is built from, comma separated |
| pair_of | Var Char (50) | pair fields: partner key (Hike % → `hikeAmt`) |
| sort_order | Int | display order |
| active | Boolean | false = hidden everywhere, history kept |
| updated_by / updated_at | Var Char (150) / DateTime | |

### AccessRole — roles added by HR (built-in roles need no row)
| Column | Type | Notes |
|---|---|---|
| role_key | Var Char (40) | built in: `hr`, `techEd`, `compMgr`; added roles get a key from the function |
| label | Var Char (60) | |
| catalyst_role | Var Char (60) | the exact Catalyst role name (Authentication → Roles) |
| sees_all | Boolean | sees all employees (otherwise no team unless an extra-team override) |
| retired | Boolean | |
| updated_by / updated_at | | |

### RoleScreen · RoleAction · FieldAccess — what each role gets
| Table | Columns |
|---|---|
| RoleScreen | role_key, screen_key, level (`none` · `view` · `edit`), updated_by, updated_at |
| RoleAction | role_key, action_key, allowed (Boolean), updated_by, updated_at |
| FieldAccess | role_key, field_key, access_limit (`edit` · `read` · `hidden`), updated_by, updated_at |

No row = default: new screen → None (HR Admin Edit); new action → No (HR Admin Yes);
input field → Edit for built-in roles, Read for added roles; master / upload fields → Read.
Calculated fields and Hike % have no rows — they follow their source columns.

### AccessOverride — one person's exception
| Column | Type | Notes |
|---|---|---|
| emp_id | Var Char (150) | Employee ID (email for a Catalyst-only user) |
| ov_type | Var Char (10) | `screen` · `action` · `field` · `role` · `team` |
| target_key | Var Char (50) | screen/action/field key, or the Employee ID whose team is added |
| value | Var Char (20) | none/view/edit · true/false · edit/read/hidden · role key · `add` |
| end_date | Date | empty = no end date (flagged on the screen) |
| reason | Text | |
| set_by / set_at | Var Char (150) / DateTime | |
| removed | Boolean | Remove keeps the row for history |
| removed_by / removed_at | Var Char (150) / DateTime | |

### AccessLog — audit trail (never edited)
changed_at (DateTime), changed_by, kind (`screen` `action` `field` `role` `override` `catalyst`), target,
role, old_value, new_value, reason (Text), batch_id.

### AccessVersion — one row (`version_key` = `ACCESS`)
version_key (Var Char 20), version (BigInt), changed_by, changed_at, why.
The page downloads access data only when this number changes.

### CatalystRoleSeen — last Catalyst roles seen (to log changes made in Catalyst)
email (Var Char 150), role_name (Var Char 60), seen_at (DateTime).

**Permissions:** ordinary users get **no write** on these 9 tables. All changes go through `accessapi`.

### Read from tables you already have (names set in SETTINGS)
- **EmployeeMaster** — emp_id, emp_name, email (= Catalyst login), status.
- **Delegation** — cycle_id, emp_id, and the **Employee IDs** of the Comp Manager and Appraiser Tech ED.
- **AppraisalCycles** — the active cycle.

---

## 2. Steps

1. **Catalyst roles** — Authentication → Roles: create **HR Admin**. Assign it to HR users.
   (Later roles, e.g. "Comp Viewer", are created here too, then added on the Access screen.)
2. **Tables** — create the 9 tables in section 1.
3. **Delegation** — make sure it stores the Comp Manager's and Appraiser Tech ED's **Employee IDs**.
4. **Settings** — open `functions/accessapi/accessCore.js`, fill `SETTINGS` (table and column names
   of Employee Master, Delegation, Appraisal Cycles; `rowKeys` used by your appraisal rows).
5. **Deploy** — copy `functions/accessapi` into your project's `functions` folder, then
   `cd functions/accessapi && npm install` and `catalyst deploy --only functions:accessapi`.
6. **First run** — sign in as App Administrator and call `POST /server/accessapi/seed`
   (writes the catalogue, starting settings and version 1). Safe to run twice.
7. **Host the page** — put `Access_Screen_v5.html` in Web Client Hosting (same project) and set
   `CONFIG.accessApiUrl = "/server/accessapi"`. Open it, check, Apply.
8. **Other functions** — copy `accessCore.js` next to each function's `index.js` and use it at the
   start of every route (section 4). Call `bumpVersion()` after any Delegation or Employee Master change.
9. **Screens** — each screen calls `GET /server/accessapi/me` at load to know what to show.
10. **Test** — log in as HR, a Tech ED, a Comp Manager, an inactive person and someone not in Delegation (section 5).

---

## 3. Endpoints

| Call | Who | What |
|---|---|---|
| `GET /version` | signed in | `{ version }` — tiny; the page compares it with its copy |
| `GET /me` | everyone | role, screens, actions, field limits, team scope |
| `GET /admin/state` | HR | catalogue, roles, settings, people, overrides, audit trail, version. Also logs Catalyst role changes |
| `POST /apply` | HR | `{ reason, changes }` — all or nothing; raises the version |
| `POST /catalog` | HR | add / rename / deactivate screens, actions, fields |
| `POST /seed` | HR / App Administrator | first run |

Rule messages come back as HTTP 200 `{ ok:false, status, error }` (clean browser console).

---

## 4. Use in other functions

```js
const access = require('./accessCore');
const a = await access.get(cat);                     // who + what they may do (403 if no access)
access.requireScreen(a, 'appraisalSheet', 'edit');
access.requireAction(a, 'bulkEdit');
rows = rows.filter((r) => access.inScope(a, r));     // own team (+ extra teams)
rows = rows.map((r) => access.shapeRow(a, r));       // drop Hidden fields — before sending
if (!access.canEdit(a, 'hikeAmt')) { /* refuse the save */ }
await access.bumpVersion(cat, a.user.email, 'Delegation changed');   // after Delegation / Employee Master changes
```
Hidden values must be removed **in the function**, not the page — otherwise they show in the network tab.
History (from payroll) is read by these functions for the user's team only — the Payroll screen stays HR only.

**Adding a new screen:** `POST /catalog` `{ "items":[{ "type":"screen","key":"bellCurve","label":"Bell curve","group":"Compensation" }] }`
(or add the row in AccessCatalog). It appears on the Access screen as None for everyone (HR Admin: Edit).

---

## 5. Checks before go-live

- HR (Catalyst role) opens Access; a Comp Manager can't (`/admin/state` → 403).
- Comp Manager set to View on Appraisal Sheet → their saves are refused by appraisalapi.
- Override with end date → gone the day after.
- Inactive in Employee Master / no email / not in Delegation → refused at `/me`.
- New Catalyst role given → audit line "Catalyst role" and version +1 on next Access load.
- Apply → version +1; reopen the page → "from copy, nothing downloaded" until the next change.

## 6. Notes

- **Credits / cost:** no AI calls. Normal Catalyst usage only (function calls, Data Store reads).
  The page calls `/version` once per open and downloads the data only when it changed.
- **All or nothing:** Data Store has no multi-row transaction; `/apply` checks everything first and
  undoes its own writes if one fails.
- **ZCQL:** reads are paged (300 rows per query). Only validated values go into queries.
- **Catalyst user list:** `/admin/state` uses `userManagement().getAllUsers()` to see Catalyst roles.
  If your SDK version doesn't allow it, the check is skipped (`catalystCheck: "skipped"`) and
  Catalyst-role people show only when they log in.
- **Tested** against an in-memory stand-in for the Catalyst SDK, and end-to-end with
  Access_Screen_v5.html: seed, HR via Catalyst role, added role, overrides (screen, action, team),
  locks, Hike % pairing, hidden-field cascade, team scope, inactive / unknown refused, new screen
  via catalogue, rollback, version and copy. Run it once in your Development environment before go-live.
