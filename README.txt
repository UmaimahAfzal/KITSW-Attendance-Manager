KITSW ATTENDANCE MANAGER — LOCAL DATABASE BUILD
================================================

This is the next engineering stage of the approved prototype.
It uses a real local SQLite database instead of browser localStorage. Node.js provides the SQLite runtime; a separate SQLite installation is not required for the application itself.

IMPORTANT
---------
- No Google/Firebase/cloud database is used.
- Attendance is stored in data\kitsw_attendance.db on this computer.
- The database survives browser refreshes and application restarts.
- The HOD login session is stored locally and remains active until Logout.
- The first-time HOD sign-up is stored in the database and cannot be repeated.
- Historical attendance reports store their own snapshot of batch/branch/section/in-charge/strength.
- Structure changes are versioned by effective date. A change on 20-Aug does not rewrite 12-Aug.
- The attendance calendar starts at the application launch date (12-Aug-2026). Dates before launch are not part of the application.
- Past dates from the launch date onward are shown as Pending until saved.
- Today is editable; future dates are visible in the calendar but locked.
- A saved report can be opened by selecting its date in the calendar.
- Saved attendance can be corrected through Modify and saved back to the same date after confirmation.
- Save/Modify confirmations use an in-app modal rather than browser alert messages.

REQUIREMENT
-----------
Install Node.js 22 or newer.

RUN
---
Double-click start.bat.
The app will open at:
http://127.0.0.1:3000

FIRST USE
---------
1. Sign Up
2. Enter the private HOD Access ID: KITSW HOD
3. Create the HOD password
4. Login with the password
5. From then on, reopening the app keeps the HOD session active until Logout.

DATABASE
--------
The database file is:
data\kitsw_attendance.db

Do not delete or rename this file if you want to keep the attendance history.

STOP
----
Double-click stop.bat when you want to stop the local server.

NEXT PACKAGING STAGE
--------------------
After the database/UI integration is tested thoroughly, this project can be packaged as a Windows desktop application so the HOD does not need to see localhost, CMD, or Node.js.
