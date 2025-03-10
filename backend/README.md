# Factifai Backend

Backend server for Factifai, providing AI vision and computer control capabilities through Puppeteer and Docker VNC.

## Prerequisites

- Node.js (Latest LTS version)
- npm
- Docker
- API key from one of the supported LLM providers

## Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
# Copy example environment file
cp .env.example .env
```

3. **Configure LLM Provider**

Choose and configure one of the supported providers in your `.env`:

```bash
# Server Configuration
PORT=3001                    # Port number for the backend server

# LLM Provider Configuration
LLM_PROVIDER=anthropic       # Options: 'anthropic', 'openai', 'gemini', 'azure'

# OmniParser Configuration (Optional)
ENABLE_OMNI_PARSER=false     # Enable/disable OmniParser feature
OMNI_PARSER_URL=            # URL for OmniParser service if enabled

# Anthropic Configuration
ANTHROPIC_API_KEY=          # Your Anthropic API key

# OpenAI Configuration
OPENAI_API_KEY=             # Your OpenAI API key

# AWS Bedrock Configuration
USE_BEDROCK=false           # Enable/disable AWS Bedrock
AWS_REGION=                 # AWS region (e.g., us-west-2)
AWS_ACCESS_KEY_ID=          # Your AWS access key ID
AWS_SECRET_ACCESS_KEY=      # Your AWS secret access key
BEDROCK_MODEL_ID=          # Bedrock model identifier

# Google Gemini Configuration
GEMINI_API_KEY=             # Your Google Gemini API key

# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=      # Azure OpenAI endpoint URL
AZURE_OPENAI_API_KEY=       # Azure OpenAI API key
AZURE_OPENAI_MODEL=         # Azure OpenAI model name
AZURE_OPENAI_VERSION=       # Azure OpenAI API version
```

4. **Start the server:**
```bash
npm run dev
```

## Automation Modes

### 1. Puppeteer Mode (Default)
- No additional setup required
- Automatically manages Chrome/Chromium browser
- Perfect for web application testing

### 2. Docker VNC Mode
For desktop and mobile app testing:

```bash
# Build and start VNC container
cd src/docker/ubuntu-vnc
docker build -t factif-ubuntu-vnc .
docker run -d \
  --name factif-vnc \
  -p 5900:5900 \
  -p 6080:6080 \
  factif-ubuntu-vnc
```

Access via:
- VNC Client: localhost:5900
- Browser: http://localhost:6080

## Project Structure

```
backend/
├── src/
│   ├── server.ts                    # Server entry point
│   ├── services/                    # Core services
│   │   ├── implementations/
│   │   │   ├── puppeteer/          # Puppeteer implementation
│   │   │   └── docker/             # Docker VNC implementation
│   │   └── interfaces/             # Service interfaces
│   └── docker/                     # Docker configurations
```

## Available Scripts

- `npm run dev` - Start development server with hot-reload
- `npm run build` - Build TypeScript
- `npm start` - Start production server

## Troubleshooting

### Vision Model Issues
- Verify API key in .env
- Check LLM_PROVIDER setting matches your API key
- Ensure API endpoint is accessible
- For Azure: Check endpoint URL and API version

### Puppeteer Issues
- Check Chrome/Chromium installation
- Verify no existing browser instances
- Check port availability

### Docker VNC Issues
- Verify Docker is running
- Check ports 5900/6080 are free
- View logs: `docker logs factif-vnc`

Quick commands:
```bash
# View VNC container logs
docker logs factif-vnc

# Restart VNC container
docker restart factif-vnc

# View server logs
npm run dev
