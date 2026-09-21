# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security issue in `@ztechnium/rai-sdk`, please report it responsibly.

1. Do **not** open a public GitHub issue for undisclosed vulnerabilities.
2. Email security reports to your ZTechnium security contact or open a private advisory on [ztechnium/rai-typescript-sdk](https://github.com/ztechnium/rai-typescript-sdk) if enabled.
3. Include:
   - Affected package version
   - Steps to reproduce
   - Impact assessment
   - Suggested remediation, if available

We aim to acknowledge reports within 3 business days and provide an initial assessment within 10 business days.

## SDK Security Notes

- Never embed runtime agent keys in browser-side JavaScript.
- Store `apiKey` values in server-side secrets management.
- Use short-lived credentials where your deployment supports them.
- Keep the SDK updated to receive compatibility and security fixes.
- Never execute consequential side effects before RAI returns `ALLOW`.
