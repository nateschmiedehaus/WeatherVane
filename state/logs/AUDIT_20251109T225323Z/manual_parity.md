### capsule_commit1 (Stage 6)
- npm --prefix tools/wvo_mcp run build
- WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION
- node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION
### capsule_commit3 (Stage 6)
- npm --prefix tools/wvo_mcp run build
- WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION
- node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION
### stage7_structure
- node scripts/check_structure.mjs
- npm --prefix tools/wvo_mcp run build
- WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION
- node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION
### stage7_codeowners
- npm --prefix tools/wvo_mcp run build
- WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION
- node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION
### stage7_shim
- npm --prefix tools/wvo_mcp run build
- WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION
- node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION
### stage7_cleanup
- npm --prefix tools/wvo_mcp run build
- WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION
- node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION
### stage7_flags
- node scripts/rollback.mjs
- npm --prefix tools/wvo_mcp run build
- WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION
- node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION
### stage7_quality_gates
- node tools/wvo_mcp/scripts/check_scas.mjs --task AFP-W0-STEP5-MUTATION
- npm --prefix tools/wvo_mcp run build
- WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION
- node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION
### post-merge-validation
- npm --prefix tools/wvo_mcp run build
- WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION
- node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION
### evidence_stage7_push
- npm --prefix tools/wvo_mcp run build
- WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION
- node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION
