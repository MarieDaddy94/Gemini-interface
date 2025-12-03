<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally, either as a web application or as a desktop application using Electron.

View your app in AI Studio: https://ai.studio/apps/drive/1ll_qPJXya2VTv8PFSgQGL1FSVkCmTbgf

## Run Locally (Web Version)

**Prerequisites:**  Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key

3. Run the app:
   ```bash
   npm run dev
   ```

## Run as Desktop Application (Electron)

**Prerequisites:**  Node.js

### Development Mode

To run the desktop app with hot-reload during development:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key

3. Start the desktop app in development mode:
   ```bash
   npm run electron:dev
   ```

This will start both the Vite dev server and Electron, with automatic reloading when you make changes to the code.

### Production Mode

To run the desktop app from the production build:

1. Build the application:
   ```bash
   npm run build
   ```

2. Start the desktop app:
   ```bash
   npm run electron:start
   ```

### Building Distributable Packages

To create a distributable desktop application for your platform:

```bash
# Build for all platforms
npm run electron:build

# Or build for specific platforms:
npm run electron:build:win    # Windows
npm run electron:build:mac    # macOS
npm run electron:build:linux  # Linux
```

The built applications will be in the `release` folder.

## Desktop App Features

The desktop version includes:
- **Native window management**: Full desktop integration with minimize, maximize, and close controls
- **Internet access**: Full access to external APIs and resources
- **Secure context**: Uses Electron's context isolation and preload script for security
- **Production-ready**: Can be packaged as a distributable application for Windows, macOS, and Linux
- **All web features**: Maintains all functionality of the web version

## Notes

- The desktop app loads from `http://localhost:5173` in development mode
- In production mode, it loads from the built files in the `dist` folder
- Internet access is fully enabled for API calls and external resources
- The app window has a minimum size of 1200x800 pixels for optimal experience
