# Factifai Frontend

This is the frontend application for Factifai, built with React, TypeScript, and Vite.

## Prerequisites

- Node.js (Latest LTS version)
- npm
- Modern web browser (Chrome recommended)

## Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
# Copy example environment file
cp .env.example .env

# Edit .env and set:
VITE_API_URL=http://localhost:3001/api  # Backend API URL
```

3. **Start development server:**
```bash
npm run dev
```

Visit http://localhost:5173 in your browser.

## Project Structure

```
frontend/
├── src/
│   ├── components/     # React components
│   │   ├── Chat/      # Chat interface components
│   │   ├── Preview/   # Preview window components
│   │   └── Terminal/  # Terminal output components
│   ├── services/      # API and socket services
│   ├── hooks/         # Custom React hooks
│   ├── utils/         # Utility functions
│   └── assets/        # Static assets
```

## Key Components

- **Chat Interface**: Natural language interaction with AI
- **Preview Window**: View and interact with puppeteer or Docker VNC streams
- **Terminal**: Real-time command output and logs
- **File Explorer**: Browse and manage screenshots and test files generation

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build locally

## Technology Stack

- React 18 with TypeScript
- Vite for fast development
- Socket.IO for real-time updates
- Tailwind CSS for styling

## Troubleshooting

### Common Issues

1. **Backend Connection Failed**
   - Verify backend server is running
   - Check VITE_API_URL in .env
   - Ensure no firewall blocking

2. **Preview Not Loading**
   - Check if Docker is running (for VNC mode)
   - Verify browser supports WebSocket

3. **Build Errors**
   - Clear npm cache: `npm cache clean --force`
   - Delete node_modules and reinstall
