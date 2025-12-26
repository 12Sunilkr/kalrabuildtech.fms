
import { Employee, User, Task, MaterialOrder, Query, ChatMessage, Project, TATUnit, LeaveRequest, ClientFinancial, VendorFinancial, Note, ChecklistTemplate, ChecklistInstance } from './types';

export const LEAVE_QUOTA_YEARLY = 10;
export const COMPANY_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='gradLeft' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%231e293b' /%3E%3Cstop offset='100%25' stop-color='%230f172a' /%3E%3C/linearGradient%3E%3ClinearGradient id='gradRight' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23334155' /%3E%3Cstop offset='100%25' stop-color='%231e293b' /%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M50 10 L15 90 L50 75 Z' fill='url(%23gradLeft)' /%3E%3Cpath d='M50 10 L85 90 L50 75 Z' fill='url(%23gradRight)' /%3E%3C/svg%3E";

export const STATUS_COLORS: Record<string, string> = {
  '1': 'bg-white text-gray-900',       // Present
  '0': 'bg-red-500 text-white',         // Absent
  '0.5': 'bg-yellow-300 text-gray-900', // Half Day
  '0.25': 'bg-blue-200 text-gray-900',  // Quarter Day
  '0.75': 'bg-orange-300 text-gray-900',// Short Leave 2
  'OFF': 'bg-[#00b050] text-white',     // Sunday
  'HOLIDAY': 'bg-[#00b050] text-white', // Holiday (Green)
  'CO': 'bg-purple-200 text-purple-900', // Comp Off
};

export const STATUS_LABELS: Record<string, string> = {
  '1': 'Present',
  '0': 'Absent',
  '0.5': 'Half Day',
  '0.25': 'Quarter Day',
  '0.75': 'Short Leave (2)',
  'OFF': 'Off Day',
  'HOLIDAY': 'Holiday',
  'CO': 'Comp Off',
};

export const MATERIAL_TAT_LIST: { name: string, value: number, unit: TATUnit }[] = [
  { name: 'Bricks', value: 48, unit: 'Hours' },
  { name: 'Steel', value: 4, unit: 'Days' },
  { name: 'Stone', value: 2, unit: 'Days' },
  { name: 'Crusher', value: 2, unit: 'Days' },
  { name: 'Sand', value: 2, unit: 'Days' },
  { name: 'Tiles', value: 10, unit: 'Days' },
  { name: 'Sanitary Material', value: 10, unit: 'Days' },
  { name: 'Electrical Material', value: 7, unit: 'Days' },
  { name: 'Cement', value: 3, unit: 'Days' },
  { name: 'MS Material', value: 5, unit: 'Days' },
  { name: 'Paint', value: 5, unit: 'Days' },
  { name: 'Hardware', value: 10, unit: 'Days' },
  { name: 'Plyboard', value: 7, unit: 'Days' },
  { name: 'Sainmica & Veneer', value: 7, unit: 'Days' },
  { name: 'Wood (Hard Wood)', value: 12, unit: 'Months' },
  { name: 'Windows', value: 90, unit: 'Days' },
  { name: 'Glass', value: 10, unit: 'Days' },
];

export const LEAVE_TYPES_LIST = ['Sick Leave', 'Casual Leave', 'Earned Leave', 'Unpaid Leave'];

export const LEAVE_SUBJECT_TEMPLATES = [
    'Sick Leave Application',
    'Urgent Piece of Work',
    'Family Function',
    'Medical Emergency',
    'Vacation Request',
    'Personal Reason'
];

// Map Departments to their allowed Designations (Roles)
export const DEPARTMENT_ROLES: Record<string, string[]> = {
  'CHAIRMAN': [],
  'CEO': [],
  'Strategy & Business Development': ['EA', 'PC'], 
  'INFORMATION TECHNOLOGY': ['MIS & Automation Developer'],
  'Project Development & Execution': ['VP Project Devl. & Execution', 'Project Manager', 'Site Engineer', 'Team'],
  'Architecture & Design': ['VP Architecture & Design', 'Chief Architect', 'Architect'],
  'Finance & Accounts': ['VP Finance & Account', 'Finance Manager', 'Account Manager', 'Team'],
  'Sales & Marketing': ['VP Sales & Marketing', 'Sales Director', 'CP Management', 'Digital Team', 'CRM & Post Sales Team'],
  'Legal Compliance & Approvals': ['VP Legal, Compliance & Approvals', 'Legal Advisor', 'Approval Head', 'Team'],
  'Administration & HR': ['VP Administration & HR', 'Admin Head', 'HR'],
  'Office Administration': ['Office Assistant']
};

export const INITIAL_EMPLOYEES: Employee[] = [];

export const INITIAL_ARCHIVED_EMPLOYEES: Employee[] = [];

export const INITIAL_USERS: User[] = [
  ({ 
    id: 'U-admin',
    email: 'admin@fms.com', 
    password: 'admin', 
    role: 'ADMIN', 
    name: 'Administrator' 
  } as User)
];

export const INITIAL_TASKS: Task[] = [];

export const INITIAL_ORDERS: MaterialOrder[] = [];

export const INITIAL_QUERIES: Query[] = [];

export const INITIAL_CHATS: ChatMessage[] = [];

export const INITIAL_PROJECTS: Project[] = [];

export const INITIAL_LEAVE_REQUESTS: LeaveRequest[] = [];

export const INITIAL_CLIENT_FINANCIALS: ClientFinancial[] = [];

export const INITIAL_VENDOR_FINANCIALS: VendorFinancial[] = [];

export const INITIAL_NOTES: Note[] = [];

export const INITIAL_CHECKLIST_TEMPLATES: ChecklistTemplate[] = [];

export const INITIAL_CHECKLIST_INSTANCES: ChecklistInstance[] = [];
