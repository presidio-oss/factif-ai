<div align="center">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" />
  <img src="https://img.shields.io/github/issues/presidio-oss/factif-ai" alt="Issues" />
  <img src="https://img.shields.io/github/stars/presidio-oss/factif-ai" alt="Stars" />
  <img src="https://img.shields.io/github/forks/presidio-oss/factif-ai" alt="Forks" />
</div>
<br />
<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/images/logo/hai-build-dark-logo.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/images/logo/hai-build-light-logo.png">
    <img alt="HAI Logo" src="assets/images/logo/hai-build-white-bg.png" height="auto">
  </picture>
</div>
<br />

<div align="center">
  <em>Automate testing through AI-powered computer control.<br>
  From manual steps to automated tests in minutes.</em>
</div>
<br>

# 🚀 Factifai

**Factifai** revolutionizes test automation by directly controlling your computer through AI. Using built-in vision capabilities of Claude, OpenAI, and Gemini along with computer use, it can navigate any application naturally - clicking, typing, and verifying results just like a human would.

> [!TIP]
> Looking for an agentic version? Check out https://factifai.io

<div align="center">
<img src="assets/gifs/factif-ai-demo.gif" alt="FACTIF-AI in action" width="900"/>
</div>

## Table of Contents
- [🌟 Overview](#-overview)
- [✨ Key Features](#-key-features)
- [📥 Getting Started](#-getting-started)
- [🖥️ Automation Modes](#️-automation-modes)
- [🔍 Explore Mode](#-explore-mode)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [📧 Contact](#-contact)

## 🌟 Overview

In today's fast-paced software development landscape, efficient testing is crucial for delivering high-quality applications. Factifai transforms how teams approach testing by combining AI vision with direct computer control, enabling natural interaction with applications.

## ✨ Key Features

### 🔮 Multi-Modal Support
Built-in support for leading vision-language models:
- **Claude**: Anthropic's advanced vision and reasoning model
- **OpenAI**: GPT-4o with visual understanding capabilities
- **Gemini**: Google's multimodal AI for computer interaction
- **[OmniParser](https://github.com/microsoft/OmniParser)**: Screen Parsing tool for Pure Vision Based GUI Agent

  <div align="center">
  <img src="assets/gifs/factif-ai-omni-parser.gif" alt="FACTIF-AI in action" width="900"/>
  </div>

### 🤖 AI-Powered Computer Control
- Intelligent element detection and navigation
- Automated verification and validation
- Comprehensive test documentation with automated screenshot capture for each step
- Integrated test case export with visual step-by-step documentation

  <div align="center">
  <img src="assets/gifs/factif-ai-save.gif" alt="FACTIF-AI in action" width="900"/>
  </div>

## 📥 Getting Started

> [!TIP]
> Looking for an agentic version? Check out https://factifai.io

1. **Download and Install**
   ```bash
   git clone https://github.com/presidio-oss/factif-ai.git
   cd factif-ai
   npm run install:all
   ```

2. **Quick Setup**
   ```bash
   # Copy environment files
   cp frontend/.env.example frontend/.env
   cp backend/.env.example backend/.env
   
   # Start the application
   npm start
   ```

3. **Access the Application**
   - Open http://localhost:5173 in your browser
   - Follow the setup wizard to configure your preferred AI model

For detailed configuration options, see:
- [Frontend Setup Guide](frontend/README.md)
- [Backend Configuration](backend/README.md)

## 🖥️ Automation Modes

Factifai offers two powerful modes of automation to cover all your testing needs:

<div align="center">
<img src="assets/gifs/factif-ai-preview.gif" alt="FACTIF-AI in action" width="900"/>
</div>

### 🌐 Puppeteer Mode (Default)
Perfect for web application testing, the AI agent uses Puppeteer to control Chrome/Chromium browser:
- **Web Testing**: Automate any web application
- **Form Handling**: Smart form detection and interaction
- **Visual Verification**: AI-powered UI validation
- **Screenshot Capture**: Automated visual documentation

### 🎯 Docker VNC Mode
For comprehensive testing of desktop and mobile applications:
```bash
# Start the VNC environment
docker run -d \
  --name factif-vnc \
  -p 5900:5900 \
  -p 6080:6080 \
  factif-ubuntu-vnc
```
Access via:
- **VNC Client**: localhost:5900
- **Browser**: http://localhost:6080

Features:
- **Desktop Apps**: Test any desktop application
- **Mobile Testing**: Use emulators for mobile apps
- **Cross-Platform**: Test across different platforms
- **Full Control**: Complete system automation

## 🔍 Explore Mode

Explore Mode enables you to map and visualize web applications through AI-powered exploration and generates detailed documenation:

<div align="center">
<img src="assets/gifs/factif-ai-explore-mode.gif" alt="FACTIF-AI Explore Mode in action" width="900"/>
</div>

### Features

- **Interactive Mapping**: Automatically detect and visualize any website structure
- **Element Detection**: AI identifies clickable elements like buttons, links, and navigation items
- **Route Classification**: Smart categorization of different application pages and routes
- **Visual Graph**: Interactive visualization of application architecture and navigation paths along with detailed documentation

### Key Benefits

- **Accelerated Discovery**: Quickly understand a new applications without manual exploration of all the pages
- **Visual Documentation**: Automatically generate visual maps of application structure
- **Enhanced Testing**: Use discovered paths to create comprehensive test scenarios
## 🤝 Contributing

To contribute to the project, start by exploring [open issues](https://github.com/presidio-oss/factif-ai/issues) or checking our [feature request board](https://github.com/presidio-oss/factif-ai/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop).

Please read our [Contributing Guidelines](./CONTRIBUTING.md) for more details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📜 Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) to keep our community approachable and respectable.

## 📧 Contact

For questions or feedback, please contact us at [hai-feedback@presidio.com](mailto:hai-feedback@presidio.com).
