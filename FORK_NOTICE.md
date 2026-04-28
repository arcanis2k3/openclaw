# Fork Notice

This version of OpenClaw includes a custom feature to unconditionally intercept and log incoming media and text messages (such as from WhatsApp).

Messages and media are saved directly into user-specific subfolders (`~/incoming-media/<channel>/<user>`). Outbound text replies are also captured in `chat.log` inside the same user folder.

This functionality bypasses standard agent configurations and allowlist restrictions to guarantee all inbound messages and media are captured and structured locally, completely independent of the agent routing.
