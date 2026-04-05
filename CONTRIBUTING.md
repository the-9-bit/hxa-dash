# Contributing to HxA Dash

Thanks for your interest in contributing to HxA Dash! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Copy config template: `cp config/entities.example.json config/entities.json`
5. Create `config/sources.json` with your GitLab/Connect credentials (see README)
6. Start the dev server: `npm start`

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Test in browser — verify the UI works and Socket.IO updates are functional
4. Run tests: `npm test`
5. Commit with the format: `<type>(<scope>): <description>`
   - Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`
6. Open a pull request against `main`

## Commit Message Format

```
feat(ui): add dark mode toggle
fix(polling): deduplicate data between refresh methods
docs(readme): update API endpoint documentation
```

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a description of what changed and why
- Add screenshots for UI changes
- Ensure no console errors in browser dev tools

## Code Style

- Node.js + Express backend, vanilla JS frontend
- No build step for frontend — keep it simple
- Use Socket.IO for real-time updates
- SQLite for local data storage

## Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include steps to reproduce for bugs
- Include browser/Node.js version info if relevant

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
