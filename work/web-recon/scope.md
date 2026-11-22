# Case Scope

## meta
- case_id: web-recon
- created: 2026-11-22T10:50:51-03:00
- operator: local
- project_root: /data/data/com.termux/files/home/sports_platform
- primary_skill: js-reverse/SKILL.md
- primary_id: R3
- lead_role: lead
- specialist_roles: []
- hint: web js-reverse frontend assets api endpoints
- preset: own-system

## auth
- status: granted
- basis: own_system
- evidence_of_auth: preset:own-system/lab
- MUST NOT proceed if status != granted

## in_scope
- assets:
  - https://app.statshub.com.br/jogos
- surfaces: []
- activities: []

## out_of_scope
- assets: []
- activities: [dos, phishing_real_users, unrestricted_exfil]

## network_profile
- mode: authorized_target_only
- notes: |
    offline | lab_only | authorized_target_only | unrestricted_lab
    Change mode only after auth.status = granted.
    Presets: offline-sample | ctf-public | own-system

## deliverables
- report: true
- field_journal: true
- diagrams: true
- timeline: true

## constraints
- timebox: {}
- stealth: low
- data_handling: anonymize

## signoff
- ready_for_act: true
- checklist:
  - [x] auth.status = granted
  - [x] in_scope.assets non-empty OR offline sample path set
  - [x] network_profile.mode chosen
  - [ ] out_of_scope reviewed
  - [ ] roles assigned (see skills/ops/role-map.md)

## ops_refs
- skills/ops/scope-contract.md
- skills/ops/evidence-finding-path.md
- skills/ops/role-map.md
- skills/ops/timeline-workitem.md
- skills/ops/IDENTITY.md
