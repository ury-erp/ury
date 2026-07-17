# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in URY, please report it responsibly.

### How to Report

**Do NOT open a public GitHub issue** for security vulnerabilities.

Instead, please:

1. **Email** your findings to the URY security team (check repository settings for contact)
2. **Use GitHub's private vulnerability reporting**:
   - Go to the repository **Security** tab
   - Click **Report a vulnerability**
   - Fill in the details of the vulnerability

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Suggested fix (if available)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Status updates**: Every 7 days until resolution
- **Resolution**: Depends on severity (critical: 7 days, high: 14 days, medium: 30 days, low: next release)

### Responsible Disclosure

We appreciate responsible disclosure and will:

- Credit security researchers in our release notes (unless anonymity is requested)
- Work with you to understand and resolve the issue
- Not take legal action against researchers who follow this policy

### Security Best Practices for Contributors

- Never commit secrets, API keys, or credentials to the repository
- Use environment variables for all sensitive configuration
- Run `npm audit` or `yarn audit` regularly to check for known vulnerabilities
- Keep dependencies up to date (Dependabot is configured to help)
- Follow the principle of least privilege when implementing new features
