# Quick Start Guide - Medical Data Collector

## 🚀 Getting Started

คู่มือนี้จะช่วยให้คุณเริ่มต้นพัฒนาโปรเจค Medical Data Collector ได้อย่างรวดเร็ว

---

## 📋 Prerequisites

### Required Software

1. **Node.js** (v18+)
   ```bash
   # Check version
   node --version  # should be >= 18.0.0
   npm --version   # should be >= 9.0.0
   ```
   Download: https://nodejs.org/

2. **Git**
   ```bash
   git --version
   ```
   Download: https://git-scm.com/

3. **Code Editor** (recommended: VS Code)
   Download: https://code.visualstudio.com/

4. **MySQL Server** (for testing)
   - MySQL 8.0+
   - Download: https://dev.mysql.com/downloads/mysql/

### Recommended VS Code Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "chrmarti.regex",
    "formulahendry.auto-rename-tag"
  ]
}
```

---

## 🏗️ Project Setup

### Step 1: Create Project Directory

```bash
mkdir medical-data-collector
cd medical-data-collector
```

### Step 2: Initialize Project

```bash
# Initialize npm
npm init -y

# Initialize git
git init
echo "node_modules/
dist/
.next/
data/
logs/
*.log
.env
.DS_Store
*.db" > .gitignore
```

### Step 3: Install Core Dependencies

```bash
# Core frameworks
npm install electron@^28.0.0 next@^14.1.0 react@^18.2.0 react-dom@^18.2.0

# TypeScript
npm install -D typescript@^5.3.0 @types/react@^18.2.0 @types/node@^20.0.0

# Electron utilities
npm install electron-builder@^24.9.0 electron-updater@^6.1.0 electron-store@^8.1.0

# MQTT
npm install aedes@^0.50.0 mqtt@^5.3.0

# Database
npm install mysql2@^3.6.0 better-sqlite3@^9.2.0

# Logging
npm install winston@^3.11.0

# Utilities
npm install date-fns@^3.0.0 zod@^3.22.0

# UI Components (Tailwind + shadcn/ui)
npm install tailwindcss@^3.4.0 postcss@^8.4.0 autoprefixer@^10.4.0
npm install class-variance-authority clsx tailwind-merge lucide-react

# Development tools
npm install -D concurrently@^8.2.0 wait-on@^7.2.0 cross-env@^7.0.0
```

### Step 4: Setup TypeScript Configurations

**tsconfig.json** (for Next.js):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "ES2020"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "electron"]
}
```

**tsconfig.electron.json** (for Electron):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "./dist",
    "rootDir": "./electron",
    "noEmit": false
  },
  "include": ["electron/**/*"],
  "exclude": ["node_modules"]
}
```

### Step 5: Setup Package.json Scripts

```json
{
  "name": "medical-data-collector",
  "version": "1.0.0",
  "description": "Medical data collection via MQTT and MySQL",
  "main": "./dist/main.js",
  "scripts": {
    "dev:next": "next dev",
    "dev:electron": "wait-on http://localhost:3000 && cross-env NODE_ENV=development electron .",
    "dev": "concurrently \"npm run dev:next\" \"npm run dev:electron\"",
    "build:next": "next build",
    "build:electron": "tsc -p tsconfig.electron.json",
    "build": "npm run build:next && npm run build:electron",
    "start": "electron .",
    "pack": "npm run build && electron-builder --dir",
    "dist": "npm run build && electron-builder",
    "dist:win": "npm run build && electron-builder --win",
    "dist:mac": "npm run build && electron-builder --mac",
    "dist:linux": "npm run build && electron-builder --linux",
    "lint": "next lint",
    "type-check": "tsc --noEmit && tsc -p tsconfig.electron.json --noEmit"
  },
  "keywords": ["medical", "mqtt", "electron", "nextjs"],
  "author": "Your Name",
  "license": "PROPRIETARY"
}
```

---

## 📁 Create Project Structure

```bash
# Create directories
mkdir -p electron/{mqtt,database,services,logger,config,ipc}
mkdir -p src/{app,components,lib,types}
mkdir -p src/components/{dashboard,settings,history,ui}
mkdir -p public/icons
mkdir -p resources
mkdir -p logs
mkdir -p data

# Create empty files to establish structure
touch electron/main.ts
touch electron/preload.ts
touch src/app/page.tsx
touch src/app/layout.tsx
touch next.config.js
touch tailwind.config.js
touch electron-builder.yml
```

---

## 🔧 Configuration Files

### next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: '.next',
  images: {
    unoptimized: true
  }
};

module.exports = nextConfig;
```

### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### electron-builder.yml

```yaml
appId: com.clinic.medical-data-collector
productName: Medical Data Collector
copyright: Copyright © 2024

directories:
  output: dist
  buildResources: resources

files:
  - electron/dist/**/*
  - src/.next/**/*
  - public/**/*
  - node_modules/**/*
  - package.json

win:
  target:
    - nsis
  icon: resources/icon.ico
  
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true

mac:
  target:
    - dmg
  icon: resources/icon.png
  category: public.app-category.healthcare-fitness

linux:
  target:
    - AppImage
    - deb
  icon: resources/icon.png
  category: Medical

publish:
  provider: github
  owner: your-username
  repo: medical-data-collector
```

---

## 💻 Initial Code Setup

### electron/main.ts (Minimal Setup)

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../.next/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
```

### electron/preload.ts

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  // Database
  testConnection: (config: any) => ipcRenderer.invoke('db:test-connection', config),
  saveConfig: (config: any) => ipcRenderer.invoke('db:save-config', config),
  
  // MQTT
  getMqttStatus: () => ipcRenderer.invoke('mqtt:get-status'),
  
  // Events
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_, ...args) => callback(...args));
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  }
});
```

### src/app/layout.tsx

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Medical Data Collector',
  description: 'Collect medical data via MQTT',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

### src/app/page.tsx

```typescript
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">Medical Data Collector</h1>
      <p className="text-lg text-gray-600">Dashboard will be here</p>
    </main>
  );
}
```

### src/app/globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

---

## 🧪 Test the Setup

### Step 1: Run Development Server

```bash
npm run dev
```

**Expected output:**
```
> medical-data-collector@1.0.0 dev
> concurrently "npm run dev:next" "npm run dev:electron"

[0] > next dev
[0] - ready started server on 0.0.0.0:3000
[1] Electron app starting...
```

You should see an Electron window with "Medical Data Collector" title.

### Step 2: Test Build

```bash
npm run build
```

**Expected output:**
```
✓ Creating an optimized production build
✓ Compiled successfully
✓ TypeScript compilation successful
```

---

## 🗄️ Setup Local Database (for development)

### MySQL Setup

```sql
-- Create development database
CREATE DATABASE clinic_db_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user
CREATE USER 'dev_user'@'localhost' IDENTIFIED BY 'dev_password';
GRANT ALL PRIVILEGES ON clinic_db_dev.* TO 'dev_user'@'localhost';
FLUSH PRIVILEGES;

-- Use the database
USE clinic_db_dev;

-- Create tables (copy from person.sql and visit.sql)
-- ... (paste the CREATE TABLE statements)
```

### SQLite Setup

SQLite database will be created automatically on first run at:
- Windows: `C:\Users\{username}\AppData\Roaming\medical-data-collector\data.db`
- macOS: `~/Library/Application Support/medical-data-collector/data.db`
- Linux: `~/.config/medical-data-collector/data.db`

---

## 🔍 Debugging Tips

### Enable Electron DevTools

```typescript
// In electron/main.ts
if (isDev) {
  mainWindow.webContents.openDevTools();
}
```

### Enable Console Logs

```typescript
// In electron/main.ts
import log from 'electron-log';

log.transports.file.level = 'debug';
log.transports.console.level = 'debug';

log.info('App starting...');
```

### Check MQTT Broker

```bash
# Install MQTT Explorer
# Download from: http://mqtt-explorer.com/

# Connect to localhost:1883
# Username: clinic_device
# Password: (from your app settings)
```

### Check Database Connection

```bash
# MySQL
mysql -u dev_user -p -h localhost clinic_db_dev

# SQLite
sqlite3 data/data.db
sqlite> .tables
sqlite> .schema
```

---

## 📚 Next Steps

### Week 1 Tasks

1. **Day 1-2: MQTT Setup**
   - [ ] Implement Aedes broker in `electron/mqtt/broker.ts`
   - [ ] Implement MQTT client in `electron/mqtt/client.ts`
   - [ ] Test pub/sub functionality

2. **Day 3-4: Database Setup**
   - [ ] Implement MySQL connection pool in `electron/database/mysql.ts`
   - [ ] Implement SQLite setup in `electron/database/sqlite.ts`
   - [ ] Create schema initialization
   - [ ] Test connections

3. **Day 5-7: Core Services**
   - [ ] Implement SessionManager in `electron/services/session-manager.ts`
   - [ ] Implement DataProcessor in `electron/services/data-processor.ts`
   - [ ] Test data flow

### Useful Commands

```bash
# Development
npm run dev              # Start development mode
npm run lint            # Run ESLint
npm run type-check      # Check TypeScript errors

# Build
npm run build           # Build for production
npm run pack            # Package without installer
npm run dist            # Create installer

# Platform-specific builds
npm run dist:win        # Windows installer
npm run dist:mac        # macOS dmg
npm run dist:linux      # Linux AppImage + deb
```

---

## 🐛 Common Issues & Solutions

### Issue: Port 3000 already in use

```bash
# Kill process on port 3000
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
```

### Issue: Electron not starting

```bash
# Clear cache
rm -rf node_modules
rm -rf .next
rm -rf dist
npm install
npm run dev
```

### Issue: TypeScript errors

```bash
# Regenerate types
npm run build:electron
npm run type-check
```

### Issue: SQLite build errors

```bash
# Rebuild native modules
npm rebuild better-sqlite3 --build-from-source
```

---

## 📖 Documentation Links

- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [Next.js Documentation](https://nextjs.org/docs)
- [Aedes MQTT Broker](https://github.com/moscajs/aedes)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [mysql2](https://github.com/sidorares/node-mysql2)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com/)

---

## 💡 Development Tips

### Hot Reload

- Next.js will hot reload automatically
- Electron main process requires restart (Ctrl+R in app)
- Use `npm run dev` to auto-restart on changes

### Code Organization

```
electron/           # All Node.js/Electron code
  mqtt/            # MQTT-specific code
  database/        # Database connections & queries
  services/        # Business logic
  logger/          # Logging utilities
  config/          # Configuration management
  ipc/             # IPC handlers

src/               # All React/Next.js code
  app/            # Next.js pages
  components/      # React components
  lib/            # Utilities & helpers
  types/          # TypeScript type definitions
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/mqtt-broker

# Make changes and commit
git add .
git commit -m "feat: implement MQTT broker"

# Push to remote
git push origin feature/mqtt-broker

# Create pull request on GitHub
```

### Testing Strategy

1. **Unit Tests**: Test individual functions
2. **Integration Tests**: Test MQTT → Database flow
3. **E2E Tests**: Test complete user workflows
4. **Manual Tests**: Test with real ESP32 devices

---

## 🎯 Success Criteria

Before moving to Week 2, ensure:

- [ ] Dev server starts without errors
- [ ] Can see Electron window with Next.js page
- [ ] TypeScript compiles without errors
- [ ] Can connect to MySQL database
- [ ] SQLite database created successfully
- [ ] Hot reload working for Next.js
- [ ] Git repository initialized
- [ ] All dependencies installed

---

## 🆘 Getting Help

### Resources

1. **Check Documentation**
   - Read PROJECT_PLAN.md
   - Read DATABASE_SCHEMA.md
   - Read ESP32_INTEGRATION_GUIDE.md

2. **Debug Mode**
   - Enable DevTools in Electron
   - Check console logs
   - Check log files in logs/ folder

3. **Community Support**
   - Electron Discord
   - Stack Overflow
   - GitHub Issues

---

## 📝 Checklist

### Initial Setup Complete When:

- [ ] Node.js and npm installed
- [ ] Project created and dependencies installed
- [ ] TypeScript configured
- [ ] Directory structure created
- [ ] Configuration files created
- [ ] Dev server runs successfully
- [ ] Electron window opens
- [ ] Next.js page renders
- [ ] Build completes successfully
- [ ] MySQL database created and accessible
- [ ] Git repository initialized

**Congratulations! You're ready to start development! 🎉**

---

**Document Version**: 1.0  
**Last Updated**: 2024-02-02  
**Next**: Follow Week 1 tasks in PROJECT_PLAN.md
