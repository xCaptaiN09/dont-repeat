# Agent instructions

<!-- Managed section maintained by dont-repeat. Edit outside the markers freely. -->

<!-- dont-repeat:start -->
## Project memory (dont-repeat)

Before non-trivial changes, read and respect:

`${memoryRelPath}`

- Do **not** re-attempt items marked as **failure** or **do_not**.
- Prefer listed **command** recipes and honor **decision** entries.
- **AUTOMATIC SELF-LOGGING (CRITICAL RULE):** If you attempt a fix, run a command, or write code that FAILS or gets rejected, you MUST log it yourself immediately before trying a different approach. Use the memory_log tool if available, or run dont-repeat log failure in the terminal. Do NOT ask the user for permission. You are strictly forbidden from repeating logged failures.

<!-- dont-repeat:end -->
