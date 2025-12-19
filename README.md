
<div align="center">
<img width="200" height="200" alt="Kalra Buildtech Logo" src="https://via.placeholder.com/200" />
<h1>Kalra Buildtech FMS</h1>
</div>

# Attendance & Facility Management System

A comprehensive enterprise application for managing workforce attendance, tasks, checklists, and site operations.

## Key Features

### 🏢 Employee Management
*   **Master Database**: Add/Edit employees, assign departments and roles.
*   **Document Vault**: Securely upload and view Aadhar/PAN cards for staff.
*   **Organization Tree**: Visual hierarchy of the company structure.

### ⏱️ Time & Attendance
*   **Shift Timer**: Real-time clock in/out for employees.
*   **Attendance Grid**: Monthly view with color-coded status (Present, Absent, Leaves).
*   **Auto-Calculation**: Automatic tracking of Half-days, Short-leaves, and Overtime.

### ✅ Checklist Monitor
*   **Recurring Tasks**: Automated schedule generation for 5 years.
*   **Smart Frequencies**: Daily (skips Sundays), Weekly, Monthly, Quarterly, Half-Yearly, Yearly.
*   **Pattern Scheduling**: Support for "First Monday", "Last Monday", and "Mid-Month" schedules.
*   **Sunday Logic**: Daily tasks are not scheduled on Sundays. All other recurring tasks falling on a Sunday are automatically shifted to the next day (Monday).

### 📋 Task Management
*   **Assignment**: Admin can assign tasks to specific employees.
*   **Tracking**: Filter by Pending, Completed, or Overdue.
*   **Workflow**: Employees submit proofs upon completion. Admin can Hold/Terminate tasks.
*   **Extensions**: Formal process for requesting deadline extensions.

### 📦 O2D (Order to Delivery)
*   **Material Requests**: Site engineers can request materials.
*   **Approval System**: Admin approvals required for processing.
*   **Delivery Tracking**: Proof of delivery (Photo) required to close orders.

### 📊 Performance & KPI
*   **Auto-Scoring**: Employees are rated based on task completion and timeliness.
*   **Report Card**: Printable individual performance reports with 5-star ratings.

### 💬 Communication
*   **Team Chat**: Direct messaging and Group chats.
*   **Query Box**: Formal ticketing system for internal issues.

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key (optional for AI features)
3. Run the app:
   `npm run dev`

## Deployment (Hostinger)

This application is built with React and Vite. Since it is a Client-Side Rendered (CSR) application, deployment on Hostinger (which typically uses LiteSpeed/Apache) requires a build step and a specific configuration file to handle routing.

### Step 1: Build the Project
Run the following command in your terminal to create the production build:
```bash
npm run build
```
This will create a `dist` folder in your project directory containing `index.html`, `assets/`, and other static files.

### Step 2: Upload to Hostinger
1.  Log in to your **Hostinger hPanel**.
2.  Go to **Files > File Manager**.
3.  Navigate to `public_html` (or the specific subdomain folder if applicable).
4.  **Delete** the default `default.php` or `index.php` if present.
5.  **Upload** all files/folders *inside* your local `dist` folder to `public_html`.
    *   *Note: Do not upload the `dist` folder itself, just the contents.*

### Step 3: Handle Routing (.htaccess)
To ensure that refreshing the page on sub-routes (e.g., `/dashboard`) works correctly without giving a 404 error, you must create a `.htaccess` file.

1.  In Hostinger File Manager (`public_html`), click **New File**.
2.  Name it `.htaccess` (ensure the dot is at the beginning).
3.  Paste the following configuration:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

4.  Save the file.

### Step 4: Environment Variables (AI Features)
If you are using the AI Text Enhancement feature:
1.  Create a file named `env-config.js` in `public_html`.
2.  Add `window.env = { GEMINI_API_KEY: "YOUR_KEY_HERE" };`
3.  Or, preferably, ensure your build process has the key baked in via `.env.production` during Step 1 (Note: In pure client-side apps, keys are visible in the network tab).

Your application is now live!
