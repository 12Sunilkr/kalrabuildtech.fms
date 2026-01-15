import { MaterialOrder } from '../../types';

export function normalizeO2dEntry(o: any): MaterialOrder {
  if (!o) return o;
  // If already normalized
  if (o.itemName && o.id) return o as MaterialOrder;
  const data = o.data || {};
  const out: any = {
    id: o.id || data.id || `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
    itemName: data.itemName || data.item || data.material || 'Unknown',
    quantity: data.quantity || data.qty || String(data.quantity || ''),
    siteLocation: data.siteLocation || data.site || '',
    description: data.description || '',
    priority: data.priority || 'Medium',
    isMonsoon: data.isMonsoon || false,
    tatValue: Number(data.tatValue || data.tat || 0),
    tatUnit: data.tatUnit || (data.tatUnit === 'Hours' ? 'Hours' : (data.tatUnit || 'Days')),
    expectedDeliveryDate: data.expectedDeliveryDate || data.expectedDelivery || null,
    orderedBy: data.orderedBy || data.requester || o.createdBy || null,
    assignedApprover: data.assignedApprover || data.approver || null,
    createdDate: data.createdDate || o.createdAt || new Date().toISOString().split('T')[0],
    approvedBy: data.approvedBy || null,
    approvalDate: data.approvalDate || null,
    vendorName: data.vendorName || null,
    vendorOrderDate: data.vendorOrderDate || null,
    status: o.status || data.status || 'PENDING_APPROVAL',
    deliveryDate: data.deliveryDate || null,
    proofAttachment: data.proofAttachment || null,
    deliveryGps: data.deliveryGps || null,
    deliveryTimestamp: data.deliveryTimestamp || null,
    adminComment: data.adminComment || null
  };
  return out as MaterialOrder;
}

export function normalizeO2dArray(rows: any[]): MaterialOrder[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(r => normalizeO2dEntry(r));
}
