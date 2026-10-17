# CartPilot demo guide

1. Open https://01m55q139gyy1y1x3m45qvt620-4173.app.sb.createos.sh. Explain: "Our agent can choose a basket; it cannot choose its own spending permission."
2. Use Movie night, four people, $35, no peanuts. Choose AI-generated optimizer (fast). Explain that this reuses source previously written by a real coding agent; choose fresh generation only when you have several minutes.
3. Show the execution journal: code transfer, actual Python stdout, exit 0, three merchant candidates and independent validation. If enabled, show the CreateOS browser observation screenshots in Proof & receipts.
4. Review the cheapest feasible basket including fees and tax. Approve in the explicitly labeled simulator.
5. Before checkout, inject Price jumps $5. The old approval is invalid. Recover & replan; review the new merchant or basket. Repeat with Item sells out if time allows.
6. Approve the fresh exact basket and complete simulated checkout. Show the single receipt and download the evidence report. No real order or payment occurs.
7. Explain CreateOS: isolated generated-code execution, restricted egress, persistent optimizer memory, file artifacts, browser observation, and idle auto-pause and on-demand resume. The app itself is hosted on CreateOS.

## Honest Stripe explanation

Stripe Projects provisions provider access. The spend approval policies demonstrate the agentic-commerce boundary. Real Link Agent Wallet + Stripe MPP test settlement is optional, separately configured, and currently unverified because the operator cannot use Link. Never present the simulator as a verified Stripe/Link payment.

## Before presenting

- Use the deployed Hackathon demo environment, not a production environment.
- Test only one workload at a time; the free CreateOS account has one concurrent VM.
- Idle auto-pause is enabled. Resume may take time if the VM has been inactive. Explicit snapshotting is optional and excluded from the fast demo path.
- Keep browser cookies and the server process alive for the session. Hosted SQLite and screenshots are deployment-local and can disappear on redeploy; export evidence before replacing the deployment.
- Do not display local environment files, OAuth credentials or quote payment capabilities on screen.
- If merchant browsing fails, the journal labels fixture fallback. If code execution fails, the mission must show the error rather than a success receipt.
