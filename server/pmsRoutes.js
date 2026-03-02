const express = require('express');
const router = express.Router();
const ctrl = require('./pmsController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads', 'pms');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
	destination: function (req, file, cb) { cb(null, uploadDir); },
	filename: function (req, file, cb) {
		const ext = path.extname(file.originalname) || '';
		const name = `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
		cb(null, name);
	}
});
const upload = multer({ storage });

// Projects
router.post('/projects', ctrl.createProject);
router.get('/projects', ctrl.listProjects);
router.get('/projects/:id', ctrl.getProject);
router.put('/projects/:id', ctrl.updateProject);
router.delete('/projects/:id', ctrl.deleteProject);

// Weekly tasks
router.post('/weekly-tasks', ctrl.createWeeklyTask);
router.get('/weekly-tasks', ctrl.listWeeklyTasks);

// Daily logs
router.post('/daily-logs', ctrl.createDailyLog);
router.get('/daily-logs', ctrl.listDailyLogs);

// Photo uploads
router.post('/pms/upload-photo', upload.single('photo'), ctrl.uploadPhoto);
router.get('/pms/photos', ctrl.listTaskPhotos);

// Calculations
router.get('/projects/:id/summary', ctrl.projectSummary);

module.exports = router;
