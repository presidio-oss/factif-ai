# Changelog

## 1.3.3

### Patch Changes

- Enhanced explore mode chat with significant bug fixes and stability improvements.

  - Including enhanced graph rendering, UI fixes, better LLM prompting, and direct URL extraction. It also addresses various bug fixes related to image display, node handling, and context management, alongside general performance and stability enhancements.

- Fix complete task description not rendering and handle docker launch errors

## 1.3.2

### Minor Changes

- Added multiple bug-fixes to stabilize the normal chat for basic computer use

### Patch Changes

- Add a wait for the 'domcontentloaded' state after performing a click action to ensure the page is fully loaded.
- Update image output to common format - added wait time for each action in the puppeteer - remove auto launch scripts from vnc and revert to LLM based actions to work on VNC

## 1.3.0

### Minor Changes

- ### Features

  - **Integrated OmniParser v2:** Delivers enriched, annotated screenshots to the LLM, enabling more informed decision-making for task execution
  - **Automated Playwright Installation:** Playwright binaries now automatically install after `npm install`, streamlining the setup process.
  - **Factifai Logo Added:** Improved visual identity with the addition of the Factifai logo.
  - **OpenAI Support for Explore Mode:** Explore mode now supports OpenAI models, expanding LLM options and capabilities.
  - **Chat History and Persistence:** Added chat history tracking with file storage persistence, allowing users to revisit previous conversations.

  **Bug Fixes:**

  - **LLM Context Isolation:** Resolved context contamination between different operating modes, ensuring accurate and isolated responses.
  - **Chat Context Management:** Implemented context management to prevent exceeding LLM token limits on complex websites.
  - **Explore Mode Graph Fix:** Corrected a bug causing incorrect graph rendering in explore mode.
  - **Seamless VNC Mode Switching:** Resolved issues with VNC mode switching, ensuring a smoother user experience.

  **Enhancements:**

  - **UX Improvements:** General UX enhancements implemented to improve usability and overall user experience.

## 1.2.0

### New Feature: Explore Mode

- **Explore Chat**: Specialized chat interface for Click-through exploration of interconnected web content of a website.
- **Graph View**: Visual representation of web pages and their relationships for easier navigation and understanding of site structure
- **Page Node System**: Interactive page nodes that display content and allow navigation between related pages
- **Recent Chats**: Easy access to previous explore mode conversations

## 1.1.0

### Enhancements

- Added browser centric approach on the puppeteer mode.
- General improvements & bugfixes

## 1.0.0

### Built-in support for leading vision-language models:

- **Claude**: Anthropic's advanced vision and reasoning model
- **OpenAI**: GPT-4o with visual understanding capabilities
- **Gemini**: Google's multimodal AI for computer interaction
- **[OmniParser](https://github.com/microsoft/OmniParser)**: Screen Parsing tool for Pure Vision Based GUI Agent

### AI-Powered Computer Control

- Intelligent element detection and navigation
- Automated verification and validation
- Comprehensive test documentation with automated screenshot capture for each step
- Integrated test case export with visual step-by-step documentation
