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
    "sibujs": "^1.2.0"{{SIBUJS_UI_DEP}}{{TAILWIND_DEPS}}
  },
  "devDependencies": {
    "sibujs-cli": "^1.2.0",
    "typescript": "~5.8.3",
    "vite": "^6.3.5"
  }
}
