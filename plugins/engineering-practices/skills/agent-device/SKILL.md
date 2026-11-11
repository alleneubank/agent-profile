---
name: agent-device
description: Use when driving an iOS, Android, macOS, or TV app through the agent-device CLI — opening an app on a simulator, emulator, or device, tapping and filling by snapshot refs, capturing screenshots, logs, or recordings, or replaying a scripted flow.
---

# agent-device (`agent-device`)

agent-device drives apps on iOS and Android simulators, emulators, and devices,
macOS, TV, and web, with accessibility snapshots that hand out `@eN` refs.

The CLI ships its own guides, matched to the installed version. Before the
first device command, read `agent-device --help` (the start, loop, and target
rules), then the topic guide the task needs:

```bash
agent-device help workflow       # refs, selectors, waits, recovery, platform limits
agent-device help <topic>        # topics listed at the end of --help: manual-qa,
                                 # react-native, physical-device, scripting, ...
agent-device help <command>      # exact shape of one command
```

## Which device tool

- Driving an app's UI to see a change work, run a QA pass, or capture evidence:
  agent-device.
- A task that names AXe or `pymobiledevice3`, or needs a physical iOS device
  service those tools expose (device logs, crash reports, provisioning): the
  `platform-tooling` skill.
- A web app in a desktop browser: the `agent-browser` skill.
