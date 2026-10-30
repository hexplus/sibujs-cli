{
  "name": "{{NAME}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "sibujs dev",
    "build": "tsc --noEmit && sibujs build && sibujs build --ssr src/entry-server.ts",
    "start": "node server.mjs",
    "prerender": "sibujs prerender",
    "preview": "sibujs preview",
    "lint": "sibujs lint",
    "analyze": "sibujs analyze"
  },
  "dependencies": {
    "sibujs": "^4.14.0"{{SIBUJS_UI_DEP}}{{TAILWIND_DEPS}}
  },
  "devDependencies": {
    "sibujs-cli": "^1.7.0",
    "typescript": "~6.0.3",
    "vite": "^8.3.1"
  },
  "engines": {
    "node": ">=22.12.0"
  }
}
