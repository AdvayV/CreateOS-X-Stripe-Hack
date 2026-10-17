# CreateOS × Stripe Hack

Dependency setup for an AI agent that writes and executes code in a CreateOS sandbox.
The agent implementation will follow once the project idea is defined.

## Local setup

Requires Node.js 22 or later, Git, Stripe CLI with the Projects plugin, and CreateOS CLI.

```sh
npm ci
```

Installed tooling:

- `@nodeops-createos/sandbox` for sandbox execution
- TypeScript and `tsx` for development

## Services

This workspace is initialized with Stripe Projects and connected to the CreateOS
Free plan. Authentication and credential files are local and are not committed.
Teammates must authorize their own accounts and use Stripe Projects to sync
credentials; credentials are never distributed through Git.

```sh
stripe projects status
stripe projects env --pull
createos whoami
```

On Windows, use `stripe.cmd` and `npm.cmd` if PowerShell blocks their script launchers.

## Current status

- Dependencies installed and SDK import verified
- Stripe Projects initialized and CreateOS integration completed
- Agent implementation and sandbox execution smoke test pending

Sandbox execution consumes CreateOS credits. Confirm the available balance and
pricing before running workloads, and destroy disposable sandboxes after use.
