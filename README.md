# 🏛️ Michelangelo: Unified Training Hub

Michelangelo is a sleek, mobile-responsive web application designed to track and log athletic training blocks. It serves as a unified frontend that routes data directly to a Google Sheets backend via Google Apps Script. 

The application is split into two specialized modules:
* **David (Lifting):** Tracks strength training across Push/Pull/Leg splits (Set A and Set B), logging weights and reps.
* **Jakub (Boxing):** A dedicated 6-round combat sports timer that tracks RPE (Rate of Perceived Exertion) and calculates average intensity per session.

**Core Feature:** Both modules feature a mandatory check for **McGill Big 3** spine hygiene/decompression, ensuring longevity and back health are prioritized before and after heavy loads or rotational work.

## 🛠️ Tech Stack
* **Frontend:** HTML5, JavaScript, Tailwind CSS (via CDN)
* **Backend:** Google Apps Script (Web App)
* **Database:** Google Sheets
* **Hosting:** GitHub Pages

## 🚀 Setup & Integration
1. Deploy the provided `Code.gs` script as a Web App in Google Apps Script.
2. Ensure your connected Google Sheet has two tabs named exactly `David` and `Jakub`.
3. Paste the generated Web App URL into the `SCRIPT_URL` variable in the `index.html` file.
