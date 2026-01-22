# PMS (Project Management System) - Implementation Guide

## Overview
Complete PMS module with Admin and Employee interfaces for project development & execution tracking with daily work sessions, photo uploads, and progress reports.

## Database Schema

The following tables have been created via migrations:

### 1. **pms_projects**
- `id` - Project unique ID
- `project_name` - Name of the project
- `assigned_employee_id` - Employee assigned to project
- `start_date` - Project start date (yyyy-MM-dd)
- `status` - Active / Completed / On-Hold
- `createdBy` - User who created the project
- `createdAt` - Creation timestamp

### 2. **pms_daily_work_logs**
- `id` - Work log unique ID
- `project_id` - FK to pms_projects
- `employee_id` - Employee ID submitting the work
- `work_date` - Date of work (yyyy-MM-dd)
- `session_number` - 1 (10:00-14:00) or 2 (14:00-18:00)
- `work_done` - Description of completed work
- `work_left` - Work pending for next day
- `approved_work_left` - Admin-approved carried forward work
- `status` - PENDING / SUBMITTED / APPROVED / REJECTED
- `createdAt` - Submission timestamp

### 3. **pms_work_photos**
- `id` - Photo unique ID
- `work_log_id` - FK to pms_daily_work_logs
- `file_path` - Path to uploaded photo
- `uploaded_by` - User ID who uploaded
- `createdAt` - Upload timestamp

### 4. **pms_project_progress**
- `id` - Progress record unique ID
- `project_id` - FK to pms_projects
- `progress_percent` - Completion percentage (0-100)
- `remarks` - Admin remarks
- `updated_by` - User ID who updated
- `createdAt` - Update timestamp

## REST API Endpoints

### Admin Endpoints

#### POST /api/pms/projects
**Create new project (ADMIN only)**
```json
{
  "project_name": "Website Redesign",
  "assigned_employee_id": "emp_123",
  "start_date": "2026-01-15"
}
```

#### GET /api/pms/projects
**Get all projects (ADMIN) or assigned projects (EMPLOYEE)**

#### GET /api/pms/projects/:id
**Get project with daily work logs and photos**

#### PUT /api/pms/projects/:id
**Update project status**
```json
{
  "status": "Active|Completed|On-Hold"
}
```

#### POST /api/pms/daily-work
**Submit daily work (EMPLOYEE)**
```json
{
  "project_id": "pms_123",
  "work_date": "2026-01-15",
  "session_number": 1,
  "work_done": "Completed UI design",
  "work_left": "Pending backend integration"
}
```

#### GET /api/pms/daily-work?projectId=
**Get daily work logs for project**

#### PUT /api/pms/daily-work/:id
**Approve work log with carried-forward work (ADMIN)**
```json
{
  "approved_work_left": "Continue with backend integration",
  "status": "APPROVED"
}
```

#### POST /api/pms/upload-photo
**Upload photo for work log (multipart/form-data)**
- Form data: `photo` (File), `work_log_id` (String)

#### PUT /api/pms/progress
**Update project progress (ADMIN only)**
```json
{
  "project_id": "pms_123",
  "progress_percent": 45,
  "remarks": "On track, UI design 50% done, awaiting backend specs"
}
```

#### GET /api/pms/reports/project/:id
**Generate project report (ADMIN only)**
Returns:
- Project details
- Total working days
- Completed sessions vs total
- Day-wise progress breakdown
- Current progress percentage
- Admin remarks

#### GET /api/pms/reports/employee/:id
**Generate employee report (ADMIN only)**
Returns:
- Employee details
- Total working days
- Total sessions completed
- Pending work count
- Projects assigned

## Frontend Components

### 1. PMSAdmin Component
**File:** `components/PMSAdmin.tsx`

**Features:**
- Create new projects
- Assign projects to employees
- Set project status (Active/Completed/On-Hold)
- View all daily work submissions
- Approve work logs with work carried forward
- Update project progress with remarks
- Upload and view employee photos
- Generate and download project reports
- Monitor employee progress
- Dashboard with project filtering

**Access:** ADMIN role only

### 2. PMSEmployee Component
**File:** `components/PMSEmployee.tsx`

**Features:**
- View assigned project details
- Submit daily work for two fixed sessions:
  - Session 1: 10:00 AM - 2:00 PM
  - Session 2: 2:00 PM - 6:00 PM
- Describe work completed and work left
- Upload multiple photos per session
- View past work submissions
- Check work approval status

**Access:** EMPLOYEE role only (for assigned project)

## Setup Instructions

### 1. Backend Setup

Already completed via migrations and `server/index.js`:
- Database tables created automatically
- PMS upload directory created at `/server/uploads/pms/`
- All API endpoints configured
- Role-based access control middleware in place

### 2. Frontend Setup

Add routing to your main App/Router:

```typescript
import PMSAdmin from './components/PMSAdmin';
import PMSEmployee from './components/PMSEmployee';

// In your router
<Route path="/pms/admin" element={
  currentUser?.role === 'ADMIN' ? <PMSAdmin ... /> : <Navigate to="/dashboard" />
} />

<Route path="/pms/employee" element={
  currentUser?.role === 'EMPLOYEE' ? <PMSEmployee ... /> : <Navigate to="/dashboard" />
} />
```

### 3. Navigation Integration

Add to your sidebar/navigation:
```typescript
{
  label: 'PMS',
  icon: <BarChart3 size={20} />,
  children: [
    ...(currentUser?.role === 'ADMIN' && [
      { label: 'Admin Panel', path: '/pms/admin' }
    ]),
    ...(currentUser?.role === 'EMPLOYEE' && [
      { label: 'My Work', path: '/pms/employee' }
    ])
  ]
}
```

## Usage Flow

### Admin Workflow

1. **Create Project**
   - Click "New Project"
   - Enter project name, select employee, set start date
   - Project created with "Active" status

2. **Monitor Progress**
   - View list of projects with filters
   - Click project to see daily submissions
   - View uploaded photos for each session
   - Each day has up to 2 sessions

3. **Approve Work**
   - Review submitted work logs
   - Click "Approve & Carry Forward"
   - Enter approved work left text
   - Carried forward work appears in next day's history

4. **Update Progress**
   - Enter completion percentage (0-100)
   - Add remarks about project status
   - Save to track project progress over time

5. **Generate Reports**
   - Click "Report" button on project
   - Downloads text file with:
     - Day-wise progress breakdown
     - Session-wise status and work descriptions
     - Overall completion percentage
     - Admin remarks history

### Employee Workflow

1. **View Assigned Project**
   - Navigate to My Work
   - Project details displayed
   - Shows project name and start date

2. **Submit Session 1 Work**
   - Enter work completed (10:00 AM - 2:00 PM)
   - Enter work left for next day
   - Upload photos (optional, multiple files)
   - Click "Submit Session 1"

3. **Submit Session 2 Work**
   - Enter work completed (2:00 PM - 6:00 PM)
   - Enter work left for next day
   - Upload photos (optional, multiple files)
   - Click "Submit Session 2"

4. **View History**
   - Switch to "History" tab
   - See all past submissions
   - View approval status
   - Check admin-approved carried forward work
   - View photos from previous sessions

## Key Features

✅ **Role-Based Access**
- Only ADMIN can create/update projects
- EMPLOYEE can only view assigned project
- Middleware enforces role requirements

✅ **Two Fixed Work Sessions**
- Session 1: 10:00 AM - 2:00 PM
- Session 2: 2:00 PM - 6:00 PM
- Clear separation of work per session

✅ **Photo Management**
- Upload multiple photos per session
- Photos linked to work logs
- Admin can view all photos
- Photo preview in UI

✅ **Work Carried Forward**
- Employee describes work left
- Admin reviews and approves
- Approved work appears in next day's history
- Admin decides what to carry forward

✅ **Progress Tracking**
- Project completion percentage
- Day-wise progress breakdown
- Session-wise status tracking
- Admin remarks and comments

✅ **Reporting**
- Project reports with day-wise breakdown
- Employee productivity reports
- Session completion statistics
- Downloadable text reports

## Security

✅ All endpoints require authentication (`requireAuth` middleware)
✅ Role-based access control with `isPMSAdmin` middleware
✅ Employees can only see assigned projects
✅ File uploads stored in secure `/uploads/pms/` directory
✅ Photo paths stored in database, actual files on disk
✅ No localStorage for sensitive data
✅ All data persisted to database

## Error Handling

- Missing required fields: 400 Bad Request
- Authorization failures: 403 Forbidden
- Resource not found: 404 Not Found
- Server errors: 500 Internal Server Error
- File upload failures: Graceful error messages
- Network failures: Automatic retry with user notification

## Performance Considerations

- Daily work logs indexed by project_id and work_date for fast queries
- Photo paths grouped by work_log_id
- Pagination ready for large datasets
- File uploads handled via Multer with size limits (10MB per photo)
- Database transactions for consistent updates

## Future Enhancements

- Batch photo uploads with progress indicator
- Work log edit capability within same day
- Project templates for recurring work
- Team assignment (multiple employees per project)
- Calendar view of work submissions
- Mobile app for photo uploads
- Auto-calculation of progress based on session completion
- Email notifications on work approvals
- Export reports to PDF/Excel

## Troubleshooting

**Issue: Photos not uploading**
- Check `/uploads/pms/` directory exists
- Verify file permissions on uploads folder
- Check multer configuration in server/index.js

**Issue: Work logs not appearing**
- Verify project_id in URL matches database
- Check employee_id matches current user
- Ensure work_date is set correctly

**Issue: Admin can't see employee projects**
- Admin should see all projects via GET /api/pms/projects
- Employees only see their assigned project
- Verify role in database

**Issue: Server not recognizing new endpoints**
- Restart Node.js server after code changes
- Verify endpoints are above catch-all routes

## Support

For issues or questions:
1. Check server logs for error messages
2. Verify database schema via migrations
3. Test API endpoints directly with Postman
4. Check browser console for client-side errors
