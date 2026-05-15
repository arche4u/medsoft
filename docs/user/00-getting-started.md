# Getting started

A 5-minute orientation to the platform.

## 1. Log in

Open the application in your browser (typically `http://localhost:3000` for development, or your team's deployed URL). You'll see the login screen.

```
┌────────────────────────────────────────┐
│   MedSoft Compliance Platform          │
│                                        │
│   Email:    [______________________]   │
│   Password: [______________________]   │
│                                        │
│              [    Log in    ]          │
└────────────────────────────────────────┘
```

Use your assigned credentials. The default demo credentials (for evaluation only, not production) are:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@medsoft.local` | `Admin@123` |
| QA | `qa@medsoft.local` | `Qa@123456` |
| QARA | `qara@medsoft.local` | `Qara@123456` |
| Developer | `dev@medsoft.local` | `Dev@123456` |
| Tester | `tester@medsoft.local` | `Test@123456` |
| Reviewer | `reviewer@medsoft.local` | `Review@123` |

After log in you land on the home dashboard.

## 2. Pick an active project

Most pages display data for **one project at a time**. Use the project picker at the top of the sidebar:

```
┌─────────────────────┐
│  [Active project ▾] │  ← click here, choose from the dropdown
│                     │
│  ▸ Plan             │
│  ▸ Develop          │
│  ▸ Docs             │
└─────────────────────┘
```

The choice is remembered across sessions. If a project gets deleted (e.g. someone re-seeded the demo data), the platform notices and resets your active project automatically.

## 3. Navigate

The sidebar has three top-level groups:

- **Plan** — Project setup and the dashboard rollup.
- **Develop** — Everything IEC 62304 §4–§7 (requirements, design, verification, risk, maintenance, traceability).
- **Docs** — All planning documents, change control, configuration management, CAPA, release, DHF, and the knowledge base.

Each group expands when clicked. Inside, sub-groups follow the IEC 62304 clause order from §4.3 → §5 → §6 → §7 → §8 → §9.

## 4. Read your role

The top-right corner shows your name, role, and a Log out button:

```
                                    [ Alice (QA) ▾ ]
```

What you can do on each page depends on your role's permissions. If you don't see a "Create" or "Edit" button on a page, you likely don't have permission for that action — ask your admin.

## 5. What to do first

Pick a starting point depending on what you're trying to accomplish:

| If you want to… | Go to |
|---|---|
| See an overview of one project's state | Plan → Dashboard |
| Add or review requirements | Develop → Requirements |
| Define the software architecture | Develop → Design → SW Architecture |
| Record a test result | Develop → Verification → (the right level) |
| Build a release | Docs → Release Management |
| Log a customer-support ticket as feedback | Develop → Maintenance → Feedback Intake |
| Generate the DHF for an auditor | Docs → DHF |
| Look up a standards reference | Docs → Knowledge Base |

If you're cold, the [end-to-end walkthrough](iec-62304-walkthrough.md) shows the full journey of one project from creation to a released v1.0.0 with a generated DHF.

## 6. Common conventions across all pages

These patterns repeat everywhere:

- **A list on the left, detail on the right.** Click an item in the list to populate the detail panel.
- **Color-coded status chips.** Green = approved / passed. Orange = in review / pending. Red = failed / rejected. Grey = draft / not run.
- **`+ New` button at the top.** Opens a modal for creating new entries.
- **Audit log.** Every Create / Update / Delete is recorded automatically. View under Docs → Audit (if your role has `VIEW_AUDIT`).
- **Inline `[ID]` chips.** Things like `URQ-001`, `FB-001`, `RSK-003` are clickable / hover-able and route you to the underlying record.

## 7. If something doesn't work

- **Tap the Help icon at the bottom of the sidebar** to open this manual in a new tab — Admins/Developers also see the Developer Guide link there.
- **You see a red error message.** Read it — most errors are descriptive (e.g. *"§6.2.3 requires post-release impact analysis before approving a CR that modifies released software"*) and tell you exactly what to fix.
- **A page says "Select a project."** Use the sidebar project picker.
- **You can't see a button you expected.** Likely a permission issue. Check your role.
- **The page is blank.** The active project may have been deleted or wiped. Re-select a current project from the sidebar.
- **The login fails.** Confirm the email/password. Tokens expire after 8 hours; if you've been idle, just log in again.
