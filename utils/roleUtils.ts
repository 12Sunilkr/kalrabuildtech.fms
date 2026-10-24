import type { Employee, User, Role } from '../types';

/**
 * Checks if a given employee, user, or identifier has an ADMIN or PC role,
 * or is linked to an account with an ADMIN or PC role.
 */
export const isAdminOrPc = (
  emp: Partial<Employee> | Partial<User> | string | null | undefined,
  users?: User[]
): boolean => {
  if (!emp) return false;

  // 1. If an ID string was passed directly
  if (typeof emp === 'string') {
    const idStr = emp.trim();
    if (!idStr) return false;

    const upperId = idStr.toUpperCase();
    if (upperId === 'E-PC101' || upperId.startsWith('U-ADMIN') || upperId.startsWith('U-PC')) {
      return true;
    }

    if (users && Array.isArray(users)) {
      const u = users.find(user => 
        String(user.employeeId) === idStr || 
        String(user.id) === idStr || 
        (user.email && user.email.toLowerCase() === idStr.toLowerCase())
      );
      if (u) {
        const r = (u.role || '').toUpperCase();
        if (r === 'ADMIN' || r === 'PC' || r === 'SUPER_ADMIN') return true;
      }
    }
    return false;
  }

  // 2. Direct role on the object (from User or Employee with role property)
  const role = (((emp as any).role) || '').toString().trim().toUpperCase();
  if (role === 'ADMIN' || role === 'PC' || role === 'SUPER_ADMIN') {
    return true;
  }

  const empId = emp.id ? String(emp.id).trim() : '';
  const upperEmpId = empId.toUpperCase();
  if (upperEmpId === 'E-PC101' || upperEmpId.startsWith('U-ADMIN') || upperEmpId.startsWith('U-PC')) {
    return true;
  }

  // 3. Designation check
  const desig = (((emp as any).designation) || '').toString().trim().toLowerCase();
  if (
    desig === 'pc' ||
    desig === 'admin' ||
    desig === 'super admin' ||
    desig === 'process coordinator'
  ) {
    return true;
  }

  // 4. Linked user check from users array
  if (users && Array.isArray(users)) {
    const linkedUser = users.find(u => {
      if (empId && u.employeeId && String(u.employeeId) === empId) return true;
      if (empId && u.id && String(u.id) === empId) return true;
      if (emp.email && u.email && u.email.trim().toLowerCase() === emp.email.trim().toLowerCase()) return true;
      if (emp.name && u.name && u.name.trim().toLowerCase() === emp.name.trim().toLowerCase()) return true;
      return false;
    });

    if (linkedUser) {
      const uRole = (linkedUser.role || '').toString().trim().toUpperCase();
      if (uRole === 'ADMIN' || uRole === 'PC' || uRole === 'SUPER_ADMIN') {
        return true;
      }
    }
  }

  return false;
};

/**
 * Filters out admin and PC members from an employee list
 */
export const filterNonAdminPcEmployees = (employees: Employee[], users?: User[]): Employee[] => {
  if (!employees || !Array.isArray(employees)) return [];
  return employees.filter(emp => !isAdminOrPc(emp, users));
};

/**
 * Checks if a given employee, user, or identifier is a Process Coordinator (PC),
 * or is linked to an account with a PC role.
 */
export const isProcessCoordinator = (
  emp: Partial<Employee> | Partial<User> | string | null | undefined,
  users?: User[]
): boolean => {
  if (!emp) return false;

  // 1. If an ID string was passed directly
  if (typeof emp === 'string') {
    const idStr = emp.trim();
    if (!idStr) return false;

    const upperId = idStr.toUpperCase();
    if (upperId === 'E-PC101' || upperId.startsWith('U-PC')) {
      return true;
    }

    if (users && Array.isArray(users)) {
      const u = users.find(user => 
        String(user.employeeId) === idStr || 
        String(user.id) === idStr || 
        (user.email && user.email.toLowerCase() === idStr.toLowerCase())
      );
      if (u) {
        const r = (u.role || '').toUpperCase();
        if (r === 'PC') return true;
      }
    }
    return false;
  }

  // 2. Direct role check
  const role = (((emp as any).role) || '').toString().trim().toUpperCase();
  if (role === 'PC') {
    return true;
  }

  const empId = emp.id ? String(emp.id).trim() : '';
  const upperEmpId = empId.toUpperCase();
  if (upperEmpId === 'E-PC101' || upperEmpId.startsWith('U-PC')) {
    return true;
  }

  // 3. Designation check
  const desig = (((emp as any).designation) || '').toString().trim().toLowerCase();
  if (
    desig === 'pc' ||
    desig === 'process coordinator' ||
    desig.includes('process coordinator')
  ) {
    return true;
  }

  // 4. Name check
  const name = (((emp as any).name) || '').toString().trim().toLowerCase();
  if (name.includes('process coordinator')) {
    return true;
  }

  // 5. Linked user check
  if (users && Array.isArray(users)) {
    const linkedUser = users.find(u => {
      if (empId && u.employeeId && String(u.employeeId) === empId) return true;
      if (empId && u.id && String(u.id) === empId) return true;
      if (emp.email && u.email && u.email.trim().toLowerCase() === emp.email.trim().toLowerCase()) return true;
      if (emp.name && u.name && u.name.trim().toLowerCase() === emp.name.trim().toLowerCase()) return true;
      return false;
    });

    if (linkedUser) {
      const uRole = (linkedUser.role || '').toString().trim().toUpperCase();
      if (uRole === 'PC') {
        return true;
      }
    }
  }

  return false;
};

/**
 * Filters out Process Coordinator (PC) members from an employee list
 */
export const filterNonPcEmployees = (employees: Employee[], users?: User[]): Employee[] => {
  if (!employees || !Array.isArray(employees)) return [];
  return employees.filter(emp => !isProcessCoordinator(emp, users));
};

