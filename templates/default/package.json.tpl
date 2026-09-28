{
  "name": "{{NAME}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "sibujs dev",
    "build": "tsc --noEmit && sibujs build",
    "preview": "sibujs preview",
    "lint": "sibujs lint",
    "analyze": "sibujs analyze"
  },
  "dependencies": {
    "sibujs": "^4.10.0"{{SIBUJS_UI_DEP}}{{TAILWIND_DEPS}}
  },
  "devDependencies": {
    "sibujs-cli": "^1.6.0",
    "typescript": "~6.0.3",
    "vite": "^8.3.1"
  },
  "engines": {
    "node": ">=22.12.0"
  }
}
