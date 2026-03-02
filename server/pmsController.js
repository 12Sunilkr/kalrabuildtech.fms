const db = require('./db');
const path = require('path');
const fs = require('fs');

async function createProject(req, res) {
  try {
    const payload = req.body;
    const [id] = await db('projects').insert(payload);
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'create_project_failed' });
  }
}

async function listProjects(req, res) {
  try {
    const projects = await db('projects').select('*').orderBy('created_at', 'desc');
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'list_projects_failed' });
  }
}

async function getProject(req, res) {
  try {
    const id = req.params.id;
    const project = await db('projects').where({ id }).first();
    if (!project) return res.status(404).json({ error: 'not_found' });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'get_project_failed' });
  }
}

async function updateProject(req, res) {
  try {
    const id = req.params.id;
    await db('projects').where({ id }).update(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'update_project_failed' });
  }
}

async function deleteProject(req, res) {
  try {
    const id = req.params.id;
    await db('projects').where({ id }).del();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'delete_project_failed' });
  }
}

// Weekly tasks
async function createWeeklyTask(req, res) {
  try {
    const [id] = await db('weekly_tasks').insert(req.body);
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'create_weekly_task_failed' });
  }
}

async function listWeeklyTasks(req, res) {
  try {
    const project_id = req.query.project_id;
    const q = db('weekly_tasks').select('*');
    if (project_id) q.where({ project_id });
    const rows = await q.orderBy('week_start_date', 'desc');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'list_weekly_tasks_failed' });
  }
}

// Daily logs
async function createDailyLog(req, res) {
  try {
    const [id] = await db('daily_logs').insert(req.body);
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'create_daily_log_failed' });
  }
}

async function listDailyLogs(req, res) {
  try {
    const project_id = req.query.project_id;
    const q = db('daily_logs').select('*');
    if (project_id) q.where({ project_id });
    const rows = await q.orderBy('date', 'desc');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'list_daily_logs_failed' });
  }
}

// Photo upload handling (expects multer to place file on disk)
async function uploadPhoto(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const daily_log_id = req.body.daily_log_id || null;
    const caption = req.body.caption || null;
    // Save record to task_photos
    const url = `/server/uploads/pms/${req.file.filename}`;
    const [id] = await db('task_photos').insert({ daily_log_id, url, caption });
    res.json({ id, url });
  } catch (err) {
    console.error('uploadPhoto error', err);
    res.status(500).json({ error: 'upload_failed' });
  }
}

async function listTaskPhotos(req, res) {
  try {
    const daily_log_id = req.query.daily_log_id;
    const q = db('task_photos').select('*');
    if (daily_log_id) q.where({ daily_log_id });
    const rows = await q.orderBy('uploaded_at', 'desc');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'list_photos_failed' });
  }
}

// Calculation endpoints
async function projectSummary(req, res) {
  try {
    const project_id = req.params.id;
    // Get tasks and progress
    const tasks = await db('weekly_tasks').where({ project_id });
    const taskIds = tasks.map(t => t.id);
    const logSums = await db('daily_logs')
      .whereIn('weekly_task_id', taskIds)
      .select('weekly_task_id')
      .sum('quantity_done_today as sum')
      .groupBy('weekly_task_id');

    const sumsById = {};
    logSums.forEach(r => { sumsById[r.weekly_task_id] = parseFloat(r.sum); });

    let weighted = 0;
    let totalWeight = 0;
    tasks.forEach(t => {
      const done = sumsById[t.id] || 0;
      const target = parseFloat(t.target_quantity || 0);
      const taskProgress = target > 0 ? (done / target) : 0;
      const weight = target;
      weighted += taskProgress * weight;
      totalWeight += weight;
    });

    const overallProgress = totalWeight > 0 ? (weighted / totalWeight) * 100 : 0;

    res.json({ overallProgress: Number(overallProgress.toFixed(2)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'project_summary_failed' });
  }
}

module.exports = {
  createProject, listProjects, getProject, updateProject, deleteProject,
  createWeeklyTask, listWeeklyTasks,
  createDailyLog, listDailyLogs,
  projectSummary
};
