# Work Items

| ID | title | role | targets | surface | status | evidence | notes |
|----|-------|------|---------|---------|--------|----------|-------|
| WI-001 | Establish scope and auth | lead | case | process | done | | auth granted, network authorized_target_only |
| WI-002 | Passive surface collection (HTML/CSS/JS) | lead | https://app.statshub.com.br | web_frontend | done | E-001, E-002, E-003, E-006 | 15 assets, sem SourceMap |
| WI-003 | Static endpoint/secret extraction | lead | evidence/assets/*.js | web_frontend | done | E-004, E-005 | 8 endpoints, 0 secrets |
| WI-004 | Frontend structure map + design tokens | lead | notes/frontend-map.md | web_frontend | done | E-007 | pronto para replicacao |
| WI-005 | Report + diagram + case review | lead | work/web-recon | process | done | E-001..E-007 | review --verify-hashes --strict |

## Coverage
- [x] Recon/analysis complete for in_scope assets
- [x] Critical/High candidates triaged (or N/A for pure RE)
- [x] Validated findings have Evidence (E-*)
- [x] Path documented (attack/call/solve)
- [x] Timeline continuous across major phases
- [x] Report via docs-generator
- [ ] field-journal anonymized

## Refs
- skills/ops/timeline-workitem.md
- skills/ops/evidence-finding-path.md
