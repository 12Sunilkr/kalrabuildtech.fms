export interface TransferOptions {
  instances: any[];
  templateId: string;
  oldDoerId?: string;
  newDoerId: string;
  newDepartment?: string;
  transferEffectiveDate: string;
  reactivate?: boolean;
}

/**
 * Applies a routine transfer / reactivation to a list of checklist instances.
 * - Tasks BEFORE transferEffectiveDate (< transferEffectiveDate):
 *   Retain their original state. Past stopped tasks remain STOPPED with the old assignee,
 *   preserving the history without penalizing the new assignee.
 * - Tasks ON OR AFTER transferEffectiveDate (>= transferEffectiveDate):
 *   Transferred to the new assignee (newDoerId and newDepartment).
 *   If reactivate is true, any STOPPED task is un-stopped to PENDING and stoppedReason is cleared.
 */
export function applyTransferToInstances(options: TransferOptions): any[] {
  const {
    instances,
    templateId,
    oldDoerId,
    newDoerId,
    newDepartment,
    transferEffectiveDate,
    reactivate = true,
  } = options;

  if (!Array.isArray(instances)) return [];

  return instances.map(inst => {
    // Only modify instances belonging to this template
    if (String(inst.templateId) !== String(templateId)) {
      return inst;
    }

    const itemDate = String(inst.date || '').trim();

    // Past / In-between tasks prior to transferEffectiveDate:
    if (itemDate < transferEffectiveDate) {
      // Must remain locked with the old assignee and stopped status
      // In-between uncompleted tasks during hiatus must be marked STOPPED (dead)
      const isCompleted = Boolean(inst.done || inst.status === 'COMPLETED');
      return {
        ...inst,
        doerId: inst.doerId || oldDoerId,
        status: isCompleted ? inst.status : 'STOPPED',
        stoppedReason: isCompleted ? inst.stoppedReason : (inst.stoppedReason || 'Routine stopped/hiatus before resumption'),
      };
    }

    // Tasks from transferEffectiveDate onwards:
    // If already completed, keep completed
    if (inst.done || inst.status === 'COMPLETED') {
      return {
        ...inst,
        doerId: inst.doerId || oldDoerId,
      };
    }

    const updated = {
      ...inst,
      doerId: newDoerId,
      department: newDepartment || inst.department,
    };

    if (reactivate) {
      updated.status = 'PENDING';
      delete updated.stoppedReason;
      delete updated.stoppedAt;
    }

    return updated;
  });
}

/**
 * Sanitizes template data when reactivating and transferring a routine.
 * Cleans up all archive-related stopping metadata.
 */
export function sanitizeTemplateOnReactivate(
  templateData: any,
  updates?: {
    newDoerId?: string;
    newDepartment?: string;
    newStartDate?: string;
  }
): any {
  const sanitized = {
    ...templateData,
    active: true,
  };

  if (updates?.newDoerId !== undefined) {
    sanitized.doerId = updates.newDoerId;
  }
  if (updates?.newDepartment !== undefined) {
    sanitized.department = updates.newDepartment;
  }
  if (updates?.newStartDate !== undefined) {
    sanitized.startDate = updates.newStartDate;
  }

  delete sanitized.stoppedDueToArchive;
  delete sanitized.archivedAt;
  delete sanitized.archivedMemberName;

  return sanitized;
}
