# Security Policy

## Reporting Security Issues

SLM Studio takes the security and privacy of users' local data with the utmost seriousness. Because SLM Studio is designed for enterprise environments where confidential documents are processed on-premise, security is a first-class requirement.

If you believe you have found a security vulnerability, please do NOT create a public issue. Instead, please report it directly to the maintainer:

- **Email**: verdantjadhav26@gmail.com
- Please include steps to reproduce, affected version, and technical details.

You will receive an acknowledgment within 48 hours.

## Security Model & Guarantees

1. **Zero Telemetry**: SLM Studio contains zero telemetry, analytics, or automated external tracking.
2. **Local Isolation**: The renderer process executes inside an Electron sandbox with `nodeIntegration: false`, `contextIsolation: true`, and a Content Security Policy enforcing `connect-src 'none'`.
3. **No Shell Execution**: Inter-process communication invokes Python via explicit parameter arrays (`execFile`), eliminating shell command injection risks.
4. **Local Network Boundary**: The only network requests permitted are read-only health checks and inference calls directed to the user-configured local Ollama instance (default `http://127.0.0.1:11434`).
