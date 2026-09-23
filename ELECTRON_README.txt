KITSW ATTENDANCE MANAGER - ELECTRON BINDING STAGE
=================================================

This folder is the Electron desktop binding of the tested KITSW Attendance Manager.

IMPORTANT:
- The existing UI is preserved.
- SQLite is still the database engine.
- The desktop app stores its writable database in the current Windows user's application-data folder.
- The developer's DB Browser is NOT required by the final app.
- The app opens in its own desktop window; no Chrome/localhost window is needed.
- The packaged app will create a fresh database on first run unless an existing database is deliberately migrated.

DEVELOPMENT:
1. Open CMD in this folder.
2. Run: npm install
3. Run: npm start

PACKAGING:
Run: npm run dist

The installer will be generated in the dist folder.
