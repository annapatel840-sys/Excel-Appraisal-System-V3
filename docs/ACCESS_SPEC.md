# Access control — implementation spec (adapted from Access_Catalyst_v5)

Source design: `Access_Screen_v5.html` + `Access_Catalyst_v5/` (accessapi, accessCore.js, README).
This document records how that design is adapted to this app. Keys here are the contract
between backend and frontend — do not rename them.

## Decisions
- Tech-ED / Comp Manager come from the **Delegation** table for the **Active** cycle
  (`Appraisal_Cycle_Master.status = 'Active'`).
- HR Admin = Catalyst role **`HR`** (built-in role key `hr`). `App Administrator` is also treated
  as HR (bootstrap).
- Catalogue = this app's real screens / actions / fields (below).
- Enforcement in every function, behind env var `ACCESS_ENFORCE`:
  - `ACCESS_ENFORCE` != `"true"` (default): **dry run** — functions behave as today, but log
    `ACCESS dry-run: would deny <email> <reason>` when access would be refused. `/me` still
    answers so the UI can be tried.
  - `ACCESS_ENFORCE = "true"`: refuse with 401/403, scope rows, drop hidden fields, block edits.

## Data Store tables (created in Development, 2026-10-02)
| Table | ID |
|---|---|
| AccessCatalog | 71873000000027270 |
| AccessRole | 71873000000017209 |
| RoleScreen | 71873000000034117 |
| RoleAction | 71873000000013200 |
| FieldAccess | 71873000000013559 |
| AccessOverride | 71873000000033154 |
| AccessLog | 71873000000021853 |
| AccessVersion | 71873000000018148 |
| CatalystRoleSeen | 71873000000039034 |
| Delegation | 71873000000025141 — cycle_id, emp_id, comp_manager_id, appraiser_tech_ed_id, updated_by, updated_at |

Existing tables read: `Employee_Master` (emp_id, emp_name, email_id, emp_status = 'Active'),
`Appraisal_Sheet` (id 71873000000020001; old name Employees), `Appraisal_Cycle_Master`
(ROWID, cycle_name, status 'Active'/'Upcoming'/…).

## Catalogue
`d` = defaults for [hr, techEd, compMgr].

### Screens
| key | label | group | hrOnly | d | where in the app |
|---|---|---|---|---|---|
| dashboard | Dashboard | Compensation | | view,view,view | route `/` |
| appraisalSheet | Appraisal Sheet | Compensation | | edit,edit,edit | route `/sheet` |
| detailScreen | Detailed Screen | Compensation | | edit,edit,edit | route `/detail-screen` |
| budgetAllocation | Budget Master | Compensation | | edit,edit,edit | route `/budget-master` and HR Ops tab `budget-master` |
| budgetDistribution | Budget Distribution | Compensation | | edit,edit,edit | HR Ops tab `budget-distribution` |
| teamChanges | Team Changes | Compensation | | view,view,view | HR Ops tab `team-changes` |
| delegation | Delegation | Compensation | | edit,edit,none | HR Ops tab `delegation` |
| employeeMaster | Employee Master · Eligibility List | HR Operations | yes | — | HR Ops tabs `roster`, `eligibility` |
| cycleMaster | Appraisal Cycle Master | HR Operations | yes | — | HR Ops tab `appraisal-cycle` |
| payroll | Payroll Data · Payroll Upload | HR Operations | yes | — | HR Ops tabs `payroll-data`, `payroll-upload` |
| settings | Settings | HR Operations | yes | — | route `/settings` |
| access | Access | HR Operations | yes | — | HR Ops tab `access` (new) |

The "HR Operations" menu item shows when the user can see at least one of its tabs.

### Actions
| key | label | group | fixed | d |
|---|---|---|---|---|
| bulkEdit | Bulk edit | Editing | | 1,1,1 |
| promote | Promote (Designation cell) | Editing | | 1,1,1 |
| importAppraisal | Import appraisal sheet (Excel) | Editing | | 1,1,1 |
| exportGrid | Export Appraisal Sheet (Excel) | Editing | | 1,1,1 |
| delegateRequest | Delegate (request) | Delegation | | 1,1,0 |
| delegateApprove | Approve delegation | Delegation | HR only | 1,0,0 |
| allotNextLevel | Allot budget to next level | Budget | | 0,1,1 |
| changeBudgetConfig | Change budget config | Budget | HR only | 1,0,0 |
| viewAudit | View audit trails | Access | | 1,1,0 |

### Fields (keys = Appraisal grid `COLUMNS` keys)
| key | kind | deps / pairOf | Appraisal_Sheet column |
|---|---|---|---|
| name | master | | name |
| designation | master | | designation |
| reportingManager | master | | reporting_manager |
| compManager | master | | comp_manager |
| appraiserTechED | master | | appraiser_tech_ed |
| wissenExperience | master | | wissen_experience |
| totalExperience | master | | total_experience |
| lastAppraisalDate | master | | last_appraisal_date |
| managerRating | master | | manager_rating |
| interviewCount | master | | interview_count |
| rrPercent | master | | rr_percent |
| grossMargin | master | | gross_margin |
| currentAnnualBasePay | master | | current_annual_base_pay |
| targetPBAllocatedForMay | master | | target_pb_allocated_for_may |
| rbToBePaid | upload | | rb_to_be_paid |
| monthRB | upload | | month_rb |
| pbToBePaid | upload | | pb_to_be_paid |
| monthPB | upload | | month_pb |
| allocatedPBAmount | input | | allocated_pb_amount |
| pbInstallment | input | | pb_installment |
| newPBToBeOffered | input | | new_pb_to_be_offered |
| newPBInstallment | input | | new_pb_installment |
| newRB | input | | new_rb |
| hikeAmount | input | | hike_amount |
| hikePct | pair | pairOf hikeAmount | hike_pct |
| targetPBNextYear | input | | target_pb_next_year |
| eligibleForPromotion | input | | eligible_for_promotion |
| newTitle | input | | new_title |
| atRisk | input | | at_risk |
| totalOfPB | calc | allocatedPBAmount, newPBToBeOffered | (computed) |
| totalBonus | calc | totalOfPB, newRB | (computed) |
| newBaseSalary | calc | currentAnnualBasePay, hikeAmount | (computed) |
| totalCTCWithRewards | calc | newBaseSalary, totalBonus | (computed) |
| totalBonusHikeAmount | calc | totalBonus, rbToBePaid, pbToBePaid | (computed) |
| totalBonusHikePct | calc | totalBonus, rbToBePaid, pbToBePaid | (computed) |
| totalRewardsHikeAmount | calc | hikeAmount, totalBonusHikeAmount | (computed) |
| totalRewardsHikePct | calc | totalRewardsHikeAmount, currentAnnualBasePay | (computed) |

`emp_id` is never hidden. Hidden fields are removed **by the function** before sending.

## accessapi endpoints (`/server/accessapi/...`)
As in the design (`/version`, `/me`, `/admin/state`, `POST /apply`, `POST /catalog`, `POST /seed`), plus:
- `GET /cycles` — HR: cycles from Appraisal_Cycle_Master `{ id, name, status }` and the active cycle id.
- `GET /delegation?cycle=<id>` — HR: Delegation rows for a cycle.
- `POST /delegation/fill` `{ cycleId, replace: true }` — HR: fill Delegation for that cycle from the
  current hierarchy (Tech-ED from `Employee_Master.appraiser_tech_ed` "EMPxxxx - Name"; Comp Manager
  from `Appraisal_Sheet.comp_manager` name → unique `Employee_Master.emp_name` → emp_id). Returns
  counts and the names that could not be matched. Raises the access version.

Every JSON response includes `enforced: <bool>`. Rule errors: HTTP 200 `{ ok:false, status, error, enforced }`.

`GET /me` → `{ ok, enforced, version, user:{email,empId,name}, role, roleLabel, roleFrom, screens:{key:level},
actions:{key:bool}, fields:{key:'edit'|'read'|'hidden'}, scope:{ all } | { all:false, cycleId, empIds:[...] } }`.

## Scope
`scope.empIds` = emp_ids from Delegation (active cycle) where `appraiser_tech_ed_id` = me (Tech ED) or
`comp_manager_id` = me (Comp Manager), plus those of each extra-team override. `seesAll` roles: `{ all:true }`.
The user's own emp_id is never in their scope (nobody appraises themselves).

## Cost
`get()` must not re-read every access table per request. Cache catalogue / roles / matrix / cycle /
delegation / employee lookups per function instance, keyed by AccessVersion (re-check the version at
most every ~30 s). Every write that changes access, Delegation or Employee_Master calls `bumpVersion()`.
