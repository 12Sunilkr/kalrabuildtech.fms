
import React, { useState } from 'react';
import { MaterialOrder, Employee, User, OrderStatus, Notification, TATUnit } from '../types';
import { MATERIAL_TAT_LIST } from '../constants';
import { Package, Plus, MapPin, Search, CheckCircle2, Clock, Truck, Camera, Upload, X, Ban, User as UserIcon, FileText, AlertTriangle, ArrowRight, ClipboardCheck, CloudRain, Download } from 'lucide-react';
import { format, addHours, addDays, addMonths, differenceInDays } from 'date-fns';
import { AITextEnhancer } from './AITextEnhancer';
import { convertFileToBase64 } from '../utils/fileHelper';

interface MaterialOrdersProps {
  orders: MaterialOrder[];
  setOrders: React.Dispatch<React.SetStateAction<MaterialOrder[]>>;
  currentUser: User;
  employees: Employee[];
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

export const MaterialOrders: React.FC<MaterialOrdersProps> = ({ orders, setOrders, currentUser, employees, addNotification }) => {
  const [activeTab, setActiveTab] = useState<'MY_REQUESTS' | 'ACTION_REQUIRED' | 'ADMIN_ALL'>('MY_REQUESTS');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState<string | null>(null); // Order ID
  const [showDeliveryModal, setShowDeliveryModal] = useState<string | null>(null); // Order ID
  const [searchTerm, setSearchTerm] = useState('');
  
  // Admin Detail View
  const [adminDetailId, setAdminDetailId] = useState<string | null>(null);

  // New Order State
  const [newOrder, setNewOrder] = useState<Partial<MaterialOrder>>({ priority: 'Medium' });
  const [vendorName, setVendorName] = useState('');
  
  // Delivery State
  const [loadingLoc, setLoadingLoc] = useState(false);

  const isAdmin = currentUser.role === 'ADMIN';

  // --- Logic Helpers ---

  // Check Monsoon: June(5), July(6), August(7), September(8)
  const checkIsMonsoon = () => {
      const month = new Date().getMonth();
      return [5, 6, 7, 8].includes(month);
  };

  // Calculate Expected Delivery Date based on TAT + Monsoon
  const calculateExpectedDate = (startDate: Date, tatVal: number, tatUnit: TATUnit, isMonsoon: boolean): string => {
      // Monsoon Buffer: 3 days as per requirement
      const buffer = isMonsoon ? 3 : 0;
      
      let finalDate = startDate;
      if (tatUnit === 'Hours') finalDate = addHours(startDate, tatVal);
      else if (tatUnit === 'Days') finalDate = addDays(startDate, tatVal + buffer);
      else if (tatUnit === 'Months') finalDate = addMonths(startDate, tatVal);
      
      return finalDate.toISOString().split('T')[0];
  };

  const getTATString = (o: MaterialOrder) => {
      let base = `${o.tatValue} ${o.tatUnit}`;
      if (o.isMonsoon && o.tatUnit === 'Days') base += " (+3d Rain)";
      return base;
  };

  const calculateFinalTAT = (o: MaterialOrder) => {
       if(o.tatUnit === 'Hours') return `${o.tatValue} Hrs`;
       let val = o.tatValue;
       if(o.isMonsoon && o.tatUnit === 'Days') val += 3;
       return `${val} ${o.tatUnit}`;
  };

  // --- Actions ---

  // 1. Employee Creates Order (Assigns to Second Employee)
  const handleCreateOrder = () => {
    if (newOrder.itemName && newOrder.quantity && newOrder.siteLocation && newOrder.assignedApprover) {
      
      // Auto-detect Monsoon
      const isMonsoon = checkIsMonsoon();
      
      // Find TAT details from constant list
      const matInfo = MATERIAL_TAT_LIST.find(m => m.name === newOrder.itemName);
      const tatVal = matInfo ? matInfo.value : 3; // Default 3 days
      const tatUnit = matInfo ? matInfo.unit : 'Days';

      const order: MaterialOrder = {
        id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
        itemName: newOrder.itemName,
        quantity: newOrder.quantity,
        siteLocation: newOrder.siteLocation,
        description: newOrder.description || '',
        priority: newOrder.priority || 'Medium',
        isMonsoon: isMonsoon,
        tatValue: tatVal,
        tatUnit: tatUnit,
        orderedBy: currentUser.employeeId || 'ADMIN',
        assignedApprover: newOrder.assignedApprover,
        createdDate: new Date().toISOString().split('T')[0],
        status: 'PENDING_APPROVAL',
      };
      setOrders([order, ...orders]);
      setShowOrderModal(false);
      setNewOrder({ priority: 'Medium' });
      addNotification('Material Request', `New request from ${currentUser.name}. Please approve.`, 'ORDER', order.assignedApprover);
    } else {
        alert("Please fill all fields including the Approver.");
    }
  };

  // 2. Second Employee Approves
  const handleApprove = (orderId: string, approved: boolean) => {
      if (approved) {
          setOrders(orders.map(o => o.id === orderId ? { 
              ...o, 
              status: 'APPROVED_FOR_VENDOR',
              approvedBy: currentUser.name,
              approvalDate: new Date().toISOString().split('T')[0]
          } : o));
          // Notify the Approver themselves (or UI update) that they now need to order
      } else {
          setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'REJECTED' } : o));
          const order = orders.find(o => o.id === orderId);
          if(order) addNotification('Order Rejected', `Order ${orderId} was rejected by ${currentUser.name}.`, 'ORDER', order.orderedBy);
      }
  };

  // 3. Second Employee Places Order to Vendor
  const handlePlaceToVendor = () => {
      if (!vendorName) return alert("Please enter vendor name");
      
      const order = orders.find(o => o.id === showVendorModal);
      if (!order) return;

      const now = new Date();
      // Calculate Expected Date now that order is placed
      const expected = calculateExpectedDate(now, order.tatValue, order.tatUnit, !!order.isMonsoon);

      setOrders(orders.map(o => o.id === showVendorModal ? {
          ...o,
          status: 'ORDERED_TO_VENDOR',
          vendorName: vendorName,
          vendorOrderDate: now.toISOString().split('T')[0],
          expectedDeliveryDate: expected
      } : o));
      
      setShowVendorModal(null);
      setVendorName('');
      addNotification('Vendor Order Placed', `Order ${order.id} sent to ${vendorName}.`, 'ORDER', order.orderedBy);
  };

  // 5. Site Person (Likely Employee 1 or 2) Uploads Proof
  const handleCaptureProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setLoadingLoc(true);
          try {
             const base64 = await convertFileToBase64(e.target.files[0]);
             
             // Get GPS
             navigator.geolocation.getCurrentPosition(
                 (pos) => {
                     submitDelivery(base64, { lat: pos.coords.latitude, lng: pos.coords.longitude });
                 },
                 (err) => {
                     alert("Location access denied. Uploading without GPS.");
                     submitDelivery(base64, undefined);
                 }
             );
          } catch (err) {
              console.error(err);
              setLoadingLoc(false);
          }
      }
  };

  const submitDelivery = (img: string, gps?: {lat: number, lng: number}) => {
      setOrders(orders.map(o => o.id === showDeliveryModal ? {
          ...o,
          status: 'DELIVERED_AWAITING_ADMIN',
          proofAttachment: img,
          deliveryGps: gps,
          deliveryTimestamp: new Date().toISOString(),
          deliveryDate: new Date().toISOString().split('T')[0]
      } : o));
      setLoadingLoc(false);
      setShowDeliveryModal(null);
      addNotification('Delivery Proof', `Delivery proof uploaded. Admin review required.`, 'ORDER', 'ADMIN');
  };

  // 6. Admin Final Review
  const handleAdminReview = (orderId: string, accepted: boolean) => {
      setOrders(orders.map(o => o.id === orderId ? {
          ...o,
          status: accepted ? 'COMPLETED' : 'REJECTED' 
      } : o));
      setAdminDetailId(null);
  };

  // --- Filter Logic ---

  const getFilteredOrders = () => {
      if (currentUser.role === 'ADMIN' && activeTab === 'ADMIN_ALL') {
          return orders;
      }
      
      const myId = currentUser.employeeId;
      
      if (activeTab === 'MY_REQUESTS') {
          // Orders created BY me
          return orders.filter(o => o.orderedBy === myId);
      }
      if (activeTab === 'ACTION_REQUIRED') {
          return orders.filter(o => 
             // 1. I need to approve (Approver)
             (o.assignedApprover === myId && o.status === 'PENDING_APPROVAL') ||
             // 2. I need to place vendor order (Approver)
             (o.assignedApprover === myId && o.status === 'APPROVED_FOR_VENDOR') ||
             // 3. I need to upload proof (Only Initiator)
             (o.orderedBy === myId && o.status === 'ORDERED_TO_VENDOR')
          );
      }
      return orders;
  };

  const displayedOrders = getFilteredOrders().filter(o => 
      o.itemName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      o.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: OrderStatus) => {
      switch(status) {
          case 'PENDING_APPROVAL': return <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-[10px] font-bold uppercase">Pending Approval</span>;
          case 'APPROVED_FOR_VENDOR': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-bold uppercase">Ready for Vendor</span>;
          case 'ORDERED_TO_VENDOR': return <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-[10px] font-bold uppercase">Vendor Ordered</span>;
          case 'DELIVERED_AWAITING_ADMIN': return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-[10px] font-bold uppercase">Proof Uploaded</span>;
          case 'COMPLETED': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold uppercase">Completed</span>;
          case 'REJECTED': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-[10px] font-bold uppercase">Rejected</span>;
      }
  };

  // --- Main Render ---

  // Admin Dashboard Table View
  if (isAdmin && activeTab === 'ADMIN_ALL') {
       return (
        <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
                 <div>
                    <h2 className="text-2xl font-extrabold text-slate-800">O2D Admin Dashboard</h2>
                    <p className="text-slate-500 text-sm">Overview of all material orders and TAT tracking.</p>
                 </div>
                 <div className="flex gap-2">
                      <button onClick={() => setActiveTab('MY_REQUESTS')} className="text-sm font-bold text-slate-500 hover:text-slate-800">Switch to Card View</button>
                 </div>
            </div>
            
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500">
                            <tr>
                                <th className="p-4">Order ID</th>
                                <th className="p-4">Material</th>
                                <th className="p-4">Request Flow</th>
                                <th className="p-4">Ordered On</th>
                                <th className="p-4">Base TAT</th>
                                <th className="p-4">Extra TAT (Monsoon)</th>
                                <th className="p-4">Final TAT</th>
                                <th className="p-4">Expected Delivery</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {displayedOrders.map(order => {
                                const requester = employees.find(e => e.id === order.orderedBy);
                                const approver = employees.find(e => e.id === order.assignedApprover);
                                
                                return (
                                    <tr key={order.id} className="hover:bg-slate-50">
                                        <td className="p-4 font-mono font-bold text-slate-600">{order.id}</td>
                                        <td className="p-4 font-bold text-slate-800">{order.itemName}</td>
                                        <td className="p-4 text-xs">
                                            <div className="font-bold text-slate-700">{requester?.name || order.orderedBy}</div>
                                            <div className="text-slate-400">to {approver?.name || order.assignedApprover}</div>
                                        </td>
                                        <td className="p-4 text-slate-500">{order.createdDate}</td>
                                        <td className="p-4 text-slate-500">{order.tatValue} {order.tatUnit}</td>
                                        <td className="p-4 text-slate-500">{order.isMonsoon ? 'Yes (+3 Days)' : 'No'}</td>
                                        <td className="p-4 font-bold text-indigo-600">{calculateFinalTAT(order)}</td>
                                        <td className="p-4 font-bold text-slate-800">{order.expectedDeliveryDate || '-'}</td>
                                        <td className="p-4">{getStatusBadge(order.status)}</td>
                                        <td className="p-4 text-right">
                                            {order.status === 'DELIVERED_AWAITING_ADMIN' ? (
                                                <button onClick={() => setAdminDetailId(order.id)} className="px-3 py-1 bg-orange-500 text-white rounded text-xs font-bold shadow hover:bg-orange-600">Review</button>
                                            ) : (
                                                 <button onClick={() => setAdminDetailId(order.id)} className="text-blue-600 hover:underline text-xs font-bold">Details</button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Admin Review Modal */}
            {adminDetailId && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg">Order Details: {adminDetailId}</h3>
                            <button onClick={() => setAdminDetailId(null)}><X size={20} className="text-slate-400"/></button>
                        </div>
                        {(() => {
                            const order = orders.find(o => o.id === adminDetailId);
                            if (!order) return null;
                            const reqName = employees.find(e => e.id === order.orderedBy)?.name;
                            const appName = employees.find(e => e.id === order.assignedApprover)?.name;

                            return (
                                <div className="p-6 overflow-y-auto max-h-[70vh]">
                                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                                        <div><span className="text-slate-400 block text-xs uppercase">Item</span> <span className="font-bold">{order.itemName}</span></div>
                                        <div><span className="text-slate-400 block text-xs uppercase">Qty</span> <span className="font-bold">{order.quantity}</span></div>
                                        <div><span className="text-slate-400 block text-xs uppercase">From</span> <span className="font-bold">{reqName}</span></div>
                                        <div><span className="text-slate-400 block text-xs uppercase">To</span> <span className="font-bold">{appName}</span></div>
                                        <div><span className="text-slate-400 block text-xs uppercase">Vendor</span> <span className="font-bold">{order.vendorName || '-'}</span></div>
                                        <div><span className="text-slate-400 block text-xs uppercase">Site</span> <span className="font-bold">{order.siteLocation}</span></div>
                                    </div>

                                    {order.status === 'DELIVERED_AWAITING_ADMIN' || order.status === 'COMPLETED' ? (
                                         <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                             <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><Camera size={16}/> Delivery Proof</h4>
                                             {order.proofAttachment ? (
                                                 <div className="space-y-2">
                                                     <img src={order.proofAttachment} className="w-full rounded-lg border border-slate-300" />
                                                     <a 
                                                        href={order.proofAttachment} 
                                                        download={`Delivery_Proof_${order.id}.jpg`}
                                                        className="flex items-center justify-center gap-2 w-full py-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
                                                     >
                                                        <Download size={14} /> Download Proof
                                                     </a>
                                                 </div>
                                             ) : <p className="text-red-500 text-xs">No image</p>}
                                             <div className="text-xs text-slate-500 space-y-1 mt-2">
                                                 <p>Time: {new Date(order.deliveryTimestamp!).toLocaleString()}</p>
                                                 <p>GPS: {order.deliveryGps?.lat.toFixed(5)}, {order.deliveryGps?.lng.toFixed(5)}</p>
                                             </div>
                                         </div>
                                    ) : (
                                        <div className="text-center p-4 bg-slate-50 rounded-xl text-slate-500 italic">No delivery proof yet.</div>
                                    )}

                                    {order.status === 'DELIVERED_AWAITING_ADMIN' && (
                                        <div className="flex gap-2 mt-6">
                                            <button onClick={() => handleAdminReview(order.id, true)} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700">Accept Proof</button>
                                            <button onClick={() => handleAdminReview(order.id, false)} className="flex-1 py-3 bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold hover:bg-red-200">Reject</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
       );
  }

  // Regular Card View
  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
              <Package size={20} />
            </div>
            O2D System
          </h2>
          <p className="text-slate-500 mt-2 font-medium md:ml-14">
            Order to Delivery Tracking System.
          </p>
        </div>
        
        <button 
          onClick={() => setShowOrderModal(true)}
          className="w-full md:w-auto bg-orange-600 hover:bg-orange-700 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20 transition-all active:scale-95 font-bold"
        >
          <Plus size={18} />
          Create Order
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-2">
           <button onClick={() => setActiveTab('MY_REQUESTS')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'MY_REQUESTS' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:bg-white'}`}>My Requests</button>
           <button onClick={() => setActiveTab('ACTION_REQUIRED')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'ACTION_REQUIRED' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:bg-white'}`}>Action Required</button>
           {isAdmin && <button onClick={() => setActiveTab('ADMIN_ALL')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'ADMIN_ALL' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:bg-white'}`}>Admin Table View</button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedOrders.length === 0 ? (
              <div className="col-span-full p-12 text-center text-slate-400 italic">No orders found in this section.</div>
          ) : (
             displayedOrders.map(order => {
              const requester = employees.find(e => e.id === order.orderedBy);
              const approver = employees.find(e => e.id === order.assignedApprover);
              
              return (
                  <div key={order.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-4">
                          <span className="font-mono text-xs text-slate-400">{order.id}</span>
                          {getStatusBadge(order.status)}
                      </div>
                      
                      <h3 className="text-xl font-extrabold text-slate-800 mb-1">{order.itemName}</h3>
                      <div className="text-orange-600 font-bold mb-3">{order.quantity}</div>
                      
                      <div className="space-y-2 text-sm text-slate-500 mb-6 flex-1">
                          <div className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                              <span className="font-bold">By:</span> {requester?.name || order.orderedBy}
                              <ArrowRight size={12}/>
                              <span className="font-bold">To:</span> {approver?.name || order.assignedApprover}
                          </div>
                          <div className="flex items-center gap-2"><MapPin size={14}/> {order.siteLocation}</div>
                          <div className="flex items-center gap-2">
                              <Clock size={14}/> TAT: {getTATString(order)}
                          </div>
                          {order.vendorName && <div className="flex items-center gap-2"><Truck size={14}/> Vendor: {order.vendorName}</div>}
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                          {/* Step 2: Approval Actions (By Assigned Approver) */}
                          {order.assignedApprover === currentUser.employeeId && order.status === 'PENDING_APPROVAL' && (
                              <div className="flex gap-2">
                                  <button onClick={() => handleApprove(order.id, true)} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700">Approve</button>
                                  <button onClick={() => handleApprove(order.id, false)} className="flex-1 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg font-bold text-xs hover:bg-red-100">Reject</button>
                              </div>
                          )}

                          {/* Step 3: Place Vendor Order (By Assigned Approver after approval) */}
                          {order.status === 'APPROVED_FOR_VENDOR' && order.assignedApprover === currentUser.employeeId && (
                              <button onClick={() => setShowVendorModal(order.id)} className="w-full py-2 bg-purple-600 text-white rounded-lg font-bold text-xs hover:bg-purple-700 flex items-center justify-center gap-2">
                                  <Truck size={14}/> Place Order to Vendor
                              </button>
                          )}

                          {/* Step 5: Site Delivery (Only Initiator can upload proof) */}
                          {order.status === 'ORDERED_TO_VENDOR' && (
                              order.orderedBy === currentUser.employeeId ? (
                               <button onClick={() => setShowDeliveryModal(order.id)} className="w-full py-2 bg-orange-500 text-white rounded-lg font-bold text-xs hover:bg-orange-600 flex items-center justify-center gap-2">
                                  <Camera size={14}/> Mark Delivered (Photo)
                               </button>
                              ) : (
                                <p className="text-center text-xs text-slate-400 italic">Waiting for {requester?.name || 'Initiator'} to upload proof.</p>
                              )
                          )}

                          {/* Status Messages */}
                          {order.status === 'PENDING_APPROVAL' && order.assignedApprover !== currentUser.employeeId && <p className="text-center text-xs text-slate-400 italic">Waiting for {approver?.name} to approve.</p>}
                          {order.status === 'APPROVED_FOR_VENDOR' && order.assignedApprover !== currentUser.employeeId && <p className="text-center text-xs text-slate-400 italic">Approved. Waiting for vendor order.</p>}
                          {order.status === 'DELIVERED_AWAITING_ADMIN' && <p className="text-center text-xs text-slate-400 italic">Delivery proof under review.</p>}
                      </div>
                  </div>
              );
             })
          )}
      </div>

      {/* MODAL 1: CREATE ORDER */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
             <div className="p-6 border-b border-slate-100 bg-orange-50/50 flex justify-between items-center shrink-0">
               <h3 className="text-xl font-extrabold text-orange-900">New Material Request</h3>
               <button onClick={() => setShowOrderModal(false)} className="p-2 hover:bg-orange-100 rounded-full text-orange-800"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-500 mb-2">
                    Request flow: You (Initiator) &rarr; Second Member (Approver) &rarr; Vendor &rarr; Site
                    {checkIsMonsoon() && <div className="mt-1 text-orange-600 font-bold flex items-center gap-1"><CloudRain size={12}/> Monsoon Detected: +3 Days added to TAT.</div>}
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Select Material</label>
                    <select 
                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 outline-none bg-white font-bold"
                        value={newOrder.itemName || ''}
                        onChange={e => setNewOrder({...newOrder, itemName: e.target.value})}
                    >
                        <option value="">-- Select Material --</option>
                        {MATERIAL_TAT_LIST.map(m => (
                            <option key={m.name} value={m.name}>{m.name} (TAT: {m.value} {m.unit})</option>
                        ))}
                    </select>
                </div>
                <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Quantity</label>
                     <input 
                        type="text" 
                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 outline-none"
                        value={newOrder.quantity || ''}
                        onChange={e => setNewOrder({...newOrder, quantity: e.target.value})}
                        placeholder="e.g. 500 Bags"
                     />
                </div>
                <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Assign Approver (Second Member)</label>
                     <select 
                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                        value={newOrder.assignedApprover || ''}
                        onChange={e => setNewOrder({...newOrder, assignedApprover: e.target.value})}
                    >
                        <option value="">-- Select Manager / Team Member --</option>
                        {employees.filter(e => e.id !== currentUser.employeeId && e.id !== 'ADMIN').map(e => (
                            <option key={e.id} value={e.id}>{e.name} ({e.department})</option>
                        ))}
                    </select>
                </div>
                 <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Site / Project Location</label>
                     <input 
                        type="text" 
                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 outline-none"
                        value={newOrder.siteLocation || ''}
                        onChange={e => setNewOrder({...newOrder, siteLocation: e.target.value})}
                        placeholder="e.g. Sector 82"
                     />
                </div>
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Priority</label>
                        <select 
                            className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                            value={newOrder.priority}
                            onChange={e => setNewOrder({...newOrder, priority: e.target.value as any})}
                        >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                        </select>
                     </div>
                 </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
               <button onClick={handleCreateOrder} className="px-5 py-2.5 bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-orange-600/20 w-full">Initiate Order</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: PLACE TO VENDOR */}
      {showVendorModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
             <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-6">
                 <h3 className="text-xl font-extrabold text-slate-800 mb-4">Place Order to Vendor</h3>
                 <p className="text-sm text-slate-500 mb-4">You have approved this request. Now enter vendor details to finalize order.</p>
                 
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Vendor Name</label>
                 <input 
                    type="text" 
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-purple-500 outline-none mb-6"
                    value={vendorName}
                    onChange={e => setVendorName(e.target.value)}
                    placeholder="e.g. UltraTech Supplies"
                 />
                 
                 <div className="flex gap-3">
                     <button onClick={() => setShowVendorModal(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancel</button>
                     <button onClick={handlePlaceToVendor} className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-600/20">Confirm Order</button>
                 </div>
             </div>
        </div>
      )}

      {/* MODAL 3: SITE DELIVERY PROOF */}
      {showDeliveryModal && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
             <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center">
                 <h3 className="text-xl font-extrabold text-slate-800 mb-2">Material Delivered?</h3>
                 <p className="text-sm text-slate-500 mb-6">Upload a live photo of the material at the site. GPS location will be captured.</p>

                 {loadingLoc ? (
                     <div className="py-8 flex flex-col items-center text-orange-500 font-bold animate-pulse">
                         <MapPin size={32} className="mb-2"/>
                         Fetching Location...
                     </div>
                 ) : (
                    <label className="w-full py-4 bg-orange-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-orange-600/30 hover:bg-orange-700 active:scale-95 transition-all">
                        <Camera size={20} /> Take Live Photo
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCaptureProof} />
                    </label>
                 )}
                 <button onClick={() => setShowDeliveryModal(null)} className="mt-4 text-slate-400 font-bold text-sm hover:text-slate-600">Cancel</button>
             </div>
         </div>
      )}

    </div>
  );
};
