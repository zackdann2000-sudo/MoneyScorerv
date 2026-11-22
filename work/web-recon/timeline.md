# Timeline (append-only)

## 2026-11-22T10:50:51-03:00 | lead | init
- action: case-init
- command_or_ref: skills/scripts/case-init.sh
- result_summary: case directory created; scope ready_for_act=true
- artifacts: [scope.md, workitems.md]
- evidence_ids: []
- decision_delta: [case_initialized]
- carry_forward_refs: [scope.md]
- next: open PRIMARY SKILL.md and ACT within scope

## 2026-11-22T13:51Z | lead | recon-passive
- action: GET raiz + login, download de assets estáticos
- command_or_ref: curl -D headers_root.txt ; curl -o login.html ; loop de 15 assets
- result_summary: /jogos -> 307 /login; 15/15 assets HTTP 200 (13 JS + 2 CSS); sem SourceMap
- artifacts: [evidence/index.html, evidence/login.html, evidence/asset_list.txt, evidence/assets/]
- evidence_ids: [E-001, E-002, E-003]
- decision_delta: [single_public_page_confirmed, app_router_detected]
- carry_forward_refs: [scope.md]
- next: static string extraction for API endpoints

## 2026-11-22T13:53Z | lead | static-endpoint-extraction
- action: rg estatico em chunks (https?://, "/...", fetch(, NEXT_PUBLIC_*, padroes de chave) + sondagem passiva de 4 caminhos PWA/SEO
- command_or_ref: rg -oN ... evidence/assets/*.js
- result_summary: 8 endpoints de auth/sessao/i18n; 0 secrets; /manifest.json e /sitemap.xml 307, /robots.txt 404, _buildManifest.js vazio
- artifacts: [evidence/E-004.md, evidence/E-005.md, evidence/E-006.md, evidence/evidence_sha256.txt]
- evidence_ids: [E-004, E-005, E-006]
- decision_delta: [no_data_endpoints_public, no_secrets_public]
- carry_forward_refs: [notes/frontend-map.md]
- next: design token extraction and report

## 2026-11-22T13:55Z | lead | deliverables
- action: id fixity + mapa de frontend + relatorio + diagrama
- command_or_ref: sha256sum ; docs-generator template JS/Web
- result_summary: 7 evidencias com hash SHA-256, mapa de frontend, relatorio com F-001..F-004 e P-001..P-002, diagrama mermaid
- artifacts: [notes/frontend-map.md, report/STATSHUB-frontend-recon.md, report/diagram-auth-flow.mmd]
- evidence_ids: [E-001, E-002, E-003, E-004, E-005, E-006, E-007]
- decision_delta: [analysis_complete]
- carry_forward_refs: [report/STATSHUB-frontend-recon.md]
- next: case-review with --verify-hashes --strict
