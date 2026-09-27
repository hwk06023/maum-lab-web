# Project instructions

- This is an adult-facing FICTIONAL educational dialogue simulator, not treatment.
- External name: 마음연습실 / Maum Lab. Proposed host: maum.hyunwoo.ai.
- Do not claim Ministry of Education approval or add official branding without verified authorization.
- No real child records, personal identifiers, or secrets in fixtures, prompts, logs, or commits.
- Keep src/cases.mjs server-only. publicCase()/viewState() are the serialization boundary.
- The model cannot set game stages or win flags. engine.mjs owns those gates.
- Keep demo and live modes visibly distinct. Never silently fall back to a demo after API failure.
- Authored scripts and AI actors are NOT empirical evidence of behavioral or treatment effectiveness.
- New content must include alternatives, support requirements, counterexamples, and review notes.
- Generated prompts remain draft until a human review; do not load drafts automatically.
- Run `npm run check` and `npm test` after changes. No external npm dependencies are required.
- Storage, rate limiting and budgets are single-process prototype implementations. Do not describe them as distributed or production-hardened.
- Before publishing, verify the owner and visibility. Default to a new private repo; never overwrite an existing remote.
- Do not grant an open-source license or upload to third parties without the owner's decision.
