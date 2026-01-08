export function success(res, data = null, message = '', status = 200) {
  try {
    return res.status(status).json({ success: true, data: data === undefined ? null : data, message: message || '' });
  } catch (e) {
    console.error('respond.success failed', e && (e.stack || e.message || e));
    try { return res.status(500).json({ success: false, data: null, message: 'Internal server error' }); } catch (e2) { /* never throw */ }
  }
}

export function failure(res, message = 'Internal server error', status = 500, data = null) {
  try {
    return res.status(status).json({ success: false, data: data === undefined ? null : data, message: message || '' });
  } catch (e) {
    console.error('respond.failure failed', e && (e.stack || e.message || e));
    try { return res.status(500).json({ success: false, data: null, message: 'Internal server error' }); } catch (e2) { /* never throw */ }
  }
}

export default { success, failure };
