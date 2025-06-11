# Contributing to CS2 Casual Enjoyer

Thank you for your interest in contributing to CS2 Casual Enjoyer! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Git](https://git-scm.com/)
- Basic knowledge of JavaScript/Electron

### Setting Up Development Environment

1. **Fork and clone the repository:**

   ```sh
   git clone https://github.com/your-username/cs2-casual-enjoyer-electron.git
   cd cs2-casual-enjoyer-electron
   ```

2. **Install dependencies:**

   ```sh
   npm install
   ```

3. **Start development mode:**

   ```sh
   npm start
   ```

## 📋 How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/skik4/cs2-casual-enjoyer-electron/issues) first
2. Create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - System information (OS, Node.js version, etc.)

### Suggesting Features

1. Check if the feature has already been requested
2. Create a new issue with:
   - Clear description of the feature
   - Use case and benefits
   - Possible implementation approach

### Code Contributions

1. **Create a feature branch:**

   ```sh
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Follow the existing code style
   - Add tests if applicable
   - Update documentation

3. **Test your changes:**

   ```sh
   npm start
   npm run lint
   ```

4. **Commit your changes:**

   ```sh
   git commit -m "feat: add your feature description"
   ```

5. **Push and create a Pull Request:**

   ```sh
   git push origin feature/your-feature-name
   ```

## 🎯 Development Guidelines

### Code Style

- Use ES6+ features and modules
- Follow existing naming conventions
- Use meaningful variable and function names
- Add comments for complex logic

### Architecture

- **Modular Design**: Keep functionality separated into specialized managers
- **Single Responsibility**: Each module should have one clear purpose
- **Event-Driven**: Use events for communication between modules
- **Error Handling**: Always handle errors gracefully

### File Structure

```text
src/
├── core/          # Core application logic
├── game/          # CS2 and game-related functionality
├── steam/         # Steam API integration
├── ui/            # User interface components
├── utils/         # Utility functions
└── shared/        # Shared constants and types
```

### Commit Message Format

Use conventional commits:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Test additions/modifications
- `chore:` - Maintenance tasks

## 🔧 Technical Areas for Contribution

### High Priority

- **Performance optimizations**: Improve startup time and memory usage
- **Error handling**: Better error messages and recovery
- **UI/UX improvements**: Enhanced user experience
- **Testing**: Add unit and integration tests

### Medium Priority

- **Localization**: Multi-language support
- **Accessibility**: Better accessibility features
- **Documentation**: Code documentation and examples

### Low Priority

- **Platform support**: Linux/macOS versions
- **Advanced features**: Additional game modes support

## 🧪 Testing

- Test your changes thoroughly before submitting
- Ensure the app works with both API keys and session tokens
- Test on different scenarios (no friends, private profiles, etc.)
- Verify the tutorial system works correctly

## 📚 Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Steam Web API Documentation](https://steamapi.xpaw.me/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## 🤝 Community

- Be respectful and constructive
- Help others learn and grow
- Share knowledge and best practices
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md) (if you create one)

## 📝 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to CS2 Casual Enjoyer! 🎮
