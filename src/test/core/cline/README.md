# `test/core/cline/` Tests

This directory contains tests specifically targeting the core [****Cline****](**../../../core/Cline.ts**) class, which orchestrates tasks such as:

**-** Starting new tasks (**`startTask`**)

**-** Resuming tasks (`resumeTaskFromHistory`**)**

**-** Partial (streamed) messages (**`ask`**/**`say`** with **`partial: true/false`**)

**-** Using various “tools” (file operations, commands, browser actions, etc.)

**-** Handling checkpoints and workspace rollbacks

These tests are structured to exercise Cline in a “black-box” style: calling high-level public methods and verifying the externally observable results (e.g., messages generated, file reads/writes, tool usage approvals). This helps ensure the tests will remain valid even if we later refactor **`Cline.ts`** into separate domain modules (e.g., for persistence, streaming, tools, etc.).

## Folder Structure

test/core/cline/

├─ ClineStartTask.test.ts

├─ ClineResumeTask.test.ts

├─ ClinePartialMessages.test.ts

├─ ClineTools.test.ts

├─ ClineCheckpoints.test.ts

└─ mocks/

├─ MockApiHandler.ts

├─ MockBrowserSession.ts

├─ MockCheckpointTracker.ts

├─ MockDiffViewProvider.ts

├─ MockTerminalManager.ts

├─ MockUrlContentFetcher.ts

└─ …

- **ClineStartTask.test.ts** ** **

**  **Tests the `startTask(...)` flow, verifying initial state, messages created, file I/O stubs, etc.

- **ClineResumeTask.test.ts** ** **

**  **Covers `resumeTaskFromHistory(...)`: how Cline loads previous conversations, merges or discards partial data, prompts the user to **continue**, etc.

- **ClinePartialMessages.test.ts** ** **

**  **Focuses on partial streaming logic **for** both `ask(...)` and `say(...)`, ensuring partial calls update existing messages rather than appending duplicates, etc.

- **ClineTools.test.ts** ** **

**  **Exercises the entire “tools” logic—auto-approval, manual approval, file ops, browser sessions, command executions, and how rejections and missing parameters are handled.

- **ClineCheckpoints.test.ts** ** **

**  **Tests checkpoint creation (`saveCheckpoint(...)`), restoration (`restoreCheckpoint(...)`), and presenting diffs (`presentMultifileDiff(...)`). Checks both the conversation-level changes and the workspace rollback behavior.

## Mocks

The `mocks/` folder contains mock or stub implementations of dependencies such as:

- **MockApiHandler** – simulates the API calls and streaming logic so we can test without hitting a real network or model endpoint. ** **
- **MockBrowserSession** – simulates launching a browser, navigating to URLs, capturing logs/screenshots, etc. ** **
- **MockCheckpointTracker** – provides dummy commit hashes and fakes the Git-like workspace restore. ** **
- **MockDiffViewProvider** – simulates file editing diffs **for** tools like `write_to_file` or `replace_in_file`. ** **
- **MockTerminalManager** – fakes out terminal sessions, captured output, and command completions. ** **
- **MockUrlContentFetcher**, **MockFs** and others – stubs out file I/O, `vscode` usage, or any other external calls.

These mocks let each test run quickly and deterministically.

## Running the Tests

If the project uses Mocha, you can typically run:

npm run test

or

npx mocha –require ts-node/register “src/test/**/*.test.ts”

(Adjust **for** your build/test pipeline as needed.)

## Writing New Tests

**1.** **Create** a **new** `.test.ts` file in `test/core/cline/` (or extend an existing suite).

**2.** **Import** the Cline **class** and relevant mocks.

**3.** **Instantiate** a mocked environment (`MockApiHandler`, `MockBrowserSession`, etc.) and provide them to Cline’s constructor as needed.

**4.** **Call** the method you want to test (e.g., `startTask(...)`, `resumeTaskFromHistory(...)`).

**5.** **Check** the **final** state:

**   **- `clineMessages` array contents.

**   **- Calls to mocks (e.g., file writes, terminal commands).

**   **- Any user feedback or partial streaming details.

## Contributing

We welcome contributions that improve the coverage and clarity of these tests. Please ensure that your changes align with the existing mocking strategy, and aim **for** black-box validation of **public** Cline APIs.

- **Open an issue** **if** you encounter unclear or redundant tests.
- **Submit a pull request** **for** any enhancements or **new** test scenarios.

Thanks **for** helping to keep the **Cline** code well-tested and reliable!
