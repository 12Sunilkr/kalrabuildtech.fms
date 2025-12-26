
export interface Employee {
  id: string;
  name: string;
  department: string;
  joiningDate: string;
  createdAt?: string; // Date when added to FMS
  status: 'Active' | 'Inactive';
  designation?: string;
  email?: string;
  phone?: string;
  birthDate?: string; // yyyy-MM-dd
  address?: string;
  avatar?: string;
  documents?: {
    aadharFront?: string;
    aadharBack?: string;
    panFront?: string;
    panBack?: string;
  };
  compOffBalance?: number;
}

export type Role = 'ADMIN' | 'EMPLOYEE';

export interface User {
  id?: any;
  email: string;
  password: string; // In a real app, never store plain text
  role: Role;
  name: string;
  employeeId?: string; // Link to Employee record if role is EMPLOYEE
}

export type AttendanceValue = 1 | 0 | 0.5 | 0.25 | 0.75 | 'HOLIDAY' | 'OFF' | 'CO'; 

export interface AttendanceRecord {
  [dateIso: string]: AttendanceValue;
}

export interface TimeLog {
  date: string;       // yyyy-MM-dd
  clockIn: string;    // ISO string
  clockOut?: string;  // ISO string
  durationHours?: number;
}

export interface MonthlyStats {
  workedDays: number;
  fullDayLeaves: number;
  totalLeaves: number;
  shortLeaves: number;
}

export interface LeaveStatus {
  employeeId: string;
  employeeName: string;
  totalLeavesTaken: number;
  quota: number;
  remaining: number;
  status: 'OK' | 'Exceeded';
}

export interface SundayRequest {
    id: string;
    employeeId: string;
    date: string;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    adminComment?: string;
}

// --- Leave Application Types ---

export type LeaveType = 'Sick Leave' | 'Casual Leave' | 'Earned Leave' | 'Unpaid Leave';
export type LeaveDurationType = 'Full Day' | 'Half Day' | 'Short Leave' | 'Multiple Days';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  durationType: LeaveDurationType;
  startDate: string;
  endDate: string;
  subject: string;
  reason: string;
  appliedTo: string; // Manager/Admin Employee ID
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  appliedOn: string;
  adminComment?: string;
}

// --- FMS / Task Types ---

export type TaskStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'HOLD' | 'TERMINATED' | 'EXTENSION_REQUESTED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ExtensionRequest {
    requestedDate: string;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    timestamp?: string; // When the request was made
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string; // Employee ID
  assignedBy: string; // Admin Name/ID
  createdDate: string; // ISO Date
  dueDate: string; // ISO Date
  status: TaskStatus;
  priority: TaskPriority;
  attachment?: string; // Mock URL for file attachment
  externalLink?: string; // Optional URL (e.g. Google Sheet)
  
  // Admin Action Reason
  statusNote?: string; // Reason for Hold/Terminate

  // Completion details
  completionDate?: string;
  completionProcess?: string; // "How to complete the task"
  completionAttachment?: string;

  // Objection / Extension details
  extensionRequest?: ExtensionRequest; // Active Request
  extensionHistory?: ExtensionRequest[]; // History of all requests
}

// --- Material Order Types ---

export type OrderStatus = 
  | 'PENDING_APPROVAL' 
  | 'APPROVED_FOR_VENDOR' 
  | 'ORDERED_TO_VENDOR' 
  | 'DELIVERED_AWAITING_ADMIN' 
  | 'COMPLETED' 
  | 'REJECTED';

export type TATUnit = 'Hours' | 'Days' | 'Months';

export interface MaterialOrder {
  id: string;
  itemName: string;
  quantity: string;
  siteLocation: string; 
  description?: string;
  priority: 'Low' | 'Medium' | 'High';
  isMonsoon?: boolean;
  
  // TAT Data
  tatValue: number;
  tatUnit: TATUnit;
  expectedDeliveryDate?: string;

  // Workflow Data
  orderedBy: string; // Employee ID (Requester - 1st Employee)
  assignedApprover: string; // Employee ID (Approver - 2nd Employee)
  createdDate: string;
  
  // Step 2: Approval
  approvedBy?: string;
  approvalDate?: string;

  // Step 3: Vendor
  vendorName?: string;
  vendorOrderDate?: string;

  // Step 5: Delivery
  status: OrderStatus;
  deliveryDate?: string;
  proofAttachment?: string; // Mandatory photo
  deliveryGps?: {
    lat: number;
    lng: number;
  };
  deliveryTimestamp?: string;

  // Step 6: Admin Review
  adminComment?: string;
}

// --- Project & Site Photo Types (New) ---

export interface Project {
  id: string;
  name: string;
  location: string;
  status: 'ACTIVE' | 'COMPLETED';
  assignedEmployees: string[]; // List of Employee IDs
  description?: string;
}

export interface SitePhoto {
  id: string;
  projectId: string;
  uploadedBy: string; // Employee ID
  timestamp: string; // ISO Date Time
  date: string; // YYYY-MM-DD (for easy filtering)
  imageUrl: string; // Base64
  gps?: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
  adminComment?: string;
}

// --- Finance Types (New) ---

export interface PaymentTransaction {
    id: string;
    date: string;
    amount: number;
    mode: 'Cheque' | 'Cash' | 'NEFT/RTGS' | 'UPI';
    remarks?: string;
}

export interface ClientFinancial {
    id: string;
    projectId: string;
    clientName: string;
    totalDealValue: number;
    receivedAmount: number;
    balance: number;
    registrationDate: string; // Changed from dueDate to registrationDate
    lastPaymentDate?: string;
    status: 'Paid' | 'Pending' | 'Overdue';
    transactions: PaymentTransaction[];
}

export interface VendorFinancial {
    id: string;
    vendorName: string;
    category: string;
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    status: 'Paid' | 'Partially Paid' | 'Pending' | 'Overdue';
    transactions: PaymentTransaction[];
}

// --- Query System Types ---

export interface Query {
  id: string;
  subject: string;
  message: string;
  from: string; // Employee ID
  to: string; // Employee ID
  date: string;
  status: 'OPEN' | 'RESOLVED';
  response?: string;
}

// --- Chat System Types ---

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string; // Can be EmployeeID or GroupID
  content: string;
  timestamp: string; // ISO
  attachment?: string; // URL/Name
  fileType?: 'image' | 'file';
}

export interface ChatGroup {
  id: string;
  name: string;
  members: string[]; // List of Employee IDs
  createdBy: string;
}

// --- Notification Types ---

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'TASK' | 'ORDER' | 'QUERY' | 'CHAT' | 'SYSTEM' | 'PROJECT' | 'LEAVE' | 'FINANCE' | 'CHECKLIST';
  targetUser: string; // 'ADMIN' | 'ALL' | EmployeeID
}

// --- Calendar / Holiday Types ---

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  description?: string;
}

export interface Reminder {
  id: string;
  userId: string; // 'ADMIN' or EmployeeID
  date: string; // YYYY-MM-DD
  title: string;
}

// --- Notepad Type ---
export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  updatedAt: string;
  category: 'Work' | 'Personal' | 'Important';
  color: 'yellow' | 'blue' | 'green' | 'pink' | 'white';
}

// --- Checklist Types ---

export type FrequencyType = 
  | 'ONE-TIME'
  | 'DAILY' 
  | 'ALTERNATE'
  | 'WEEKLY' 
  | 'FORTNIGHTLY'
  | 'MONTHLY' 
  | 'QUARTERLY' 
  | 'HALF-YEARLY' 
  | 'YEARLY'
  | 'EVENT-BASED'
  | 'PARTICULAR-DATE';

export interface ChecklistConfig {
    frequency: FrequencyType;
    weekDays?: number[]; // 0=Sun, 1=Mon... for WEEKLY
    dayOfMonth?: number; // 1-31 for MONTHLY
    particularDateType?: 'EVERY-MONTH' | 'EVERY-YEAR'; // Sub-selection for PARTICULAR-DATE
}

export interface ChecklistTemplate {
    id: string;
    taskName: string;
    doerId: string; // Employee ID
    department: string;
    startDate: string; // YYYY-MM-DD
    config: ChecklistConfig;
    active: boolean;
}

export interface ChecklistInstance {
    id: string;
    templateId: string;
    date: string; // YYYY-MM-DD (Scheduled Date)
    status: 'PENDING' | 'COMPLETED';
    completedDate?: string;
    shiftedDueToHoliday?: boolean; // Tracking if it was moved from Sun/Holiday
}

export enum ViewMode {
  // Admin Views
  DASHBOARD = 'DASHBOARD',
  ATTENDANCE = 'ATTENDANCE',
  CALENDAR = 'CALENDAR', 
  EMPLOYEES = 'EMPLOYEES',
  ARCHIVED_STAFF = 'ARCHIVED_STAFF', 
  LEAVES = 'LEAVES',
  HOLIDAYS = 'HOLIDAYS',
  FMS_TASKS = 'FMS_TASKS',
  MATERIAL_ORDERS = 'MATERIAL_ORDERS',
  PROJECTS = 'PROJECTS', 
  FINANCE = 'FINANCE', 
  CHECKLIST = 'CHECKLIST', 
  PERFORMANCE = 'PERFORMANCE', 
  QUERIES = 'QUERIES', 
  CHAT = 'CHAT', 
  TIME_LOGS = 'TIME_LOGS', 
  NOTIFICATIONS = 'NOTIFICATIONS', 
  ORGANIZATION_TREE = 'ORGANIZATION_TREE', 
  README = 'README',
  NOTEPAD = 'NOTEPAD',
  DATABASE = 'DATABASE',
  
  // Employee Views
  EMPLOYEE_HOME = 'EMPLOYEE_HOME',
  EMPLOYEE_TASKS = 'EMPLOYEE_TASKS',
  EMPLOYEE_ORDERS = 'EMPLOYEE_ORDERS',
  EMPLOYEE_PROJECTS = 'EMPLOYEE_PROJECTS', 
  EMPLOYEE_QUERIES = 'EMPLOYEE_QUERIES', 
  EMPLOYEE_CHAT = 'EMPLOYEE_CHAT', 
  EMPLOYEE_HISTORY = 'EMPLOYEE_HISTORY'
}
