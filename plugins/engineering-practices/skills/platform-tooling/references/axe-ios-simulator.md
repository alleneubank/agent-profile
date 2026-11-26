# AXe iOS Simulator Automation

AXe is a single-binary CLI that drives a booted iOS Simulator through Apple's
accessibility APIs and HID (`brew install cameroncooke/axe/axe`). Its command
set changes between releases, so the binary is the reference: `axe --help`
lists the subcommands and `axe help <subcommand>` gives each one's flags.
Checked against 1.8.0.

- Every command takes `--udid <simulator-udid>`; `axe list-simulators` prints
  them.
- `axe describe-ui` prints the accessibility tree. Read it first, then target
  elements by `--id` or `--label` instead of coordinates, which move with
  layout and device size.
- After an action, read `describe-ui` again and act on the state it shows. The
  `--pre-delay` and `--post-delay` flags pace input; elapsed time does not show
  that a screen has settled.
- `axe batch` runs ordered steps in one simulator session; use it for a
  multi-step interaction instead of one process per step.
- `axe screenshot` and `axe record-video` capture evidence.
