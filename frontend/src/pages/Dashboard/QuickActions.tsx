import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Select } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';

type ModalType = 'menu' | 'table' | 'room' | 'branch' | 'user' | null;

export const QuickActions: React.FC = () => {
  const navigate = useNavigate();
  const { refreshDashboard } = useBranchContext();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form states
  const [menuForm, setMenuForm] = useState({ name: '', course: 'Main Course', price: '' });
  const [tableForm, setTableForm] = useState({ name: '', seats: '4', room: 'Main Dining', shape: 'Square' });
  const [roomForm, setRoomForm] = useState({ name: '', type: 'AC', branch: 'Downtown Main' });
  const [branchForm, setBranchForm] = useState({ name: '', code: '', invoicePrefix: 'INV-' });
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'URY Cashier' });

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleClose = () => {
    setActiveModal(null);
  };

  const handleSubmitMenu = (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuForm.name || !menuForm.price) return;
    showNotification(`Successfully added item "${menuForm.name}" to menu.`);
    setMenuForm({ name: '', course: 'Main Course', price: '' });
    handleClose();
    refreshDashboard();
  };

  const handleSubmitTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableForm.name) return;
    showNotification(`Successfully added Table "${tableForm.name}" (${tableForm.seats} seats).`);
    setTableForm({ name: '', seats: '4', room: 'Main Dining', shape: 'Square' });
    handleClose();
    refreshDashboard();
  };

  const handleSubmitRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomForm.name) return;
    showNotification(`Successfully added Dining Zone "${roomForm.name}".`);
    setRoomForm({ name: '', type: 'AC', branch: 'Downtown Main' });
    handleClose();
    refreshDashboard();
  };

  const handleSubmitBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchForm.name) return;
    showNotification(`Successfully configured branch "${branchForm.name}".`);
    setBranchForm({ name: '', code: '', invoicePrefix: 'INV-' });
    handleClose();
    refreshDashboard();
  };

  const handleSubmitUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name || !userForm.email) return;
    showNotification(`Successfully added user "${userForm.name}" as ${userForm.role}.`);
    setUserForm({ name: '', email: '', role: 'URY Cashier' });
    handleClose();
    refreshDashboard();
  };

  const actionCards = [
    {
      title: 'Open POS Terminal',
      description: 'Launch billing counter for active restaurant orders',
      actionText: 'Launch POS',
      color: 'bg-purple-600 hover:bg-purple-700 text-white',
      border: 'border-purple-200',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
      onClick: () => navigate('/pos'),
    },
    {
      title: 'Add Menu Item',
      description: 'Create new dishes, pricing, or course categories',
      actionText: '+ Add Menu',
      color: 'bg-white hover:bg-purple-50 text-purple-700',
      border: 'border-gray-200 hover:border-purple-300',
      icon: (
        <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
          />
        </svg>
      ),
      onClick: () => setActiveModal('menu'),
    },
    {
      title: 'Add Table',
      description: 'Configure new dining table layout & seat capacity',
      actionText: '+ Add Table',
      color: 'bg-white hover:bg-purple-50 text-purple-700',
      border: 'border-gray-200 hover:border-purple-300',
      icon: (
        <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      ),
      onClick: () => setActiveModal('table'),
    },
    {
      title: 'Add Room / Zone',
      description: 'Set up AC Hall, Terrace, VIP, or Bar dining sections',
      actionText: '+ Add Zone',
      color: 'bg-white hover:bg-purple-50 text-purple-700',
      border: 'border-gray-200 hover:border-purple-300',
      icon: (
        <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0v-5a2 2 0 012-2h2a2 2 0 012 2v5m-6 0h6"
          />
        </svg>
      ),
      onClick: () => setActiveModal('room'),
    },
    {
      title: 'Add Branch',
      description: 'Configure multi-outlet restaurant profiles & prefixes',
      actionText: '+ Add Branch',
      color: 'bg-white hover:bg-purple-50 text-purple-700',
      border: 'border-gray-200 hover:border-purple-300',
      icon: (
        <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0v-5a2 2 0 012-2h2a2 2 0 012 2v5m-6 0h6"
          />
        </svg>
      ),
      onClick: () => setActiveModal('branch'),
    },
    {
      title: 'Add User / Staff',
      description: 'Grant cashier, captain, or manager POS permissions',
      actionText: '+ Add User',
      color: 'bg-white hover:bg-purple-50 text-purple-700',
      border: 'border-gray-200 hover:border-purple-300',
      icon: (
        <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
          />
        </svg>
      ),
      onClick: () => setActiveModal('user'),
    },
  ];

  return (
    <section className="w-full">
      {/* Toast feedback banner */}
      {toastMessage && (
        <div className="mb-4 rounded-xl bg-purple-900 text-white px-4 py-3 shadow-md flex items-center justify-between text-xs font-semibold animate-fade-in">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-purple-200 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Quick Operations & Setup</h2>
        <span className="text-xs text-gray-500 font-medium">Fast action shortcuts</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {actionCards.map((card, idx) => (
          <Card
            key={idx}
            onClick={card.onClick}
            className={`cursor-pointer rounded-xl border ${card.border} p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between`}
          >
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                {card.icon}
              </div>
              <h3 className="font-bold text-sm text-gray-900">{card.title}</h3>
              <p className="mt-1 text-xs text-gray-500 line-clamp-2">{card.description}</p>
            </div>
            <div className="mt-4">
              <Button
                variant={idx === 0 ? 'default' : 'outline'}
                size="sm"
                className={`w-full justify-center text-xs font-bold ${idx === 0 ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'border-purple-200 text-purple-700 hover:bg-purple-50'}`}
              >
                {card.actionText}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* 1. Add Menu Drawer/Dialog */}
      <Dialog open={activeModal === 'menu'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-gray-200 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">Add Menu Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitMenu} className="space-y-4 mt-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Item Name</label>
              <Input
                placeholder="e.g. Paneer Tikka Masala"
                value={menuForm.name}
                onChange={(e: any) => setMenuForm({ ...menuForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Course / Category</label>
              <Select
                value={menuForm.course}
                onChange={(e: any) => setMenuForm({ ...menuForm, course: e.target.value })}
              >
                <option value="Starters">Starters / Appetizers</option>
                <option value="Main Course">Main Course</option>
                <option value="Breads">Breads & Naan</option>
                <option value="Dessert">Dessert</option>
                <option value="Beverages">Beverages</option>
              </Select>
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Price (₹)</label>
              <Input
                type="number"
                placeholder="e.g. 280"
                value={menuForm.price}
                onChange={(e: any) => setMenuForm({ ...menuForm, price: e.target.value })}
                required
              />
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                Save Item
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. Add Table Drawer/Dialog */}
      <Dialog open={activeModal === 'table'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-gray-200 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">Add Table</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitTable} className="space-y-4 mt-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Table Name / Number</label>
              <Input
                placeholder="e.g. T-15"
                value={tableForm.name}
                onChange={(e: any) => setTableForm({ ...tableForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Seating Capacity</label>
              <Input
                type="number"
                placeholder="e.g. 4"
                value={tableForm.seats}
                onChange={(e: any) => setTableForm({ ...tableForm, seats: e.target.value })}
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Dining Room / Zone</label>
              <Select
                value={tableForm.room}
                onChange={(e: any) => setTableForm({ ...tableForm, room: e.target.value })}
              >
                <option value="Main Dining">Main Dining</option>
                <option value="Terrace Garden">Terrace Garden</option>
                <option value="AC Family Section">AC Family Section</option>
                <option value="VIP Lounge">VIP Lounge</option>
              </Select>
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                Save Table
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3. Add Room / Zone Dialog */}
      <Dialog open={activeModal === 'room'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-gray-200 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">Add Dining Zone / Room</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitRoom} className="space-y-4 mt-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Zone Name</label>
              <Input
                placeholder="e.g. Outdoor Deck"
                value={roomForm.name}
                onChange={(e: any) => setRoomForm({ ...roomForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Zone Type</label>
              <Select
                value={roomForm.type}
                onChange={(e: any) => setRoomForm({ ...roomForm, type: e.target.value })}
              >
                <option value="AC">AC Dining</option>
                <option value="Non-AC">Non-AC Dining</option>
                <option value="Rooftop">Rooftop / Open Air</option>
                <option value="Bar">Bar & Lounge</option>
              </Select>
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                Save Zone
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 4. Add Branch Dialog */}
      <Dialog open={activeModal === 'branch'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-gray-200 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">Add Restaurant Branch</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitBranch} className="space-y-4 mt-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Branch Name</label>
              <Input
                placeholder="e.g. Waterfront Bistro"
                value={branchForm.name}
                onChange={(e: any) => setBranchForm({ ...branchForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Branch Code</label>
              <Input
                placeholder="e.g. WF-05"
                value={branchForm.code}
                onChange={(e: any) => setBranchForm({ ...branchForm, code: e.target.value })}
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Invoice Prefix</label>
              <Input
                placeholder="e.g. INV-WF-"
                value={branchForm.invoicePrefix}
                onChange={(e: any) => setBranchForm({ ...branchForm, invoicePrefix: e.target.value })}
              />
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                Create Branch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Add User Dialog */}
      <Dialog open={activeModal === 'user'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-gray-200 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">Add Staff User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitUser} className="space-y-4 mt-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Full Name</label>
              <Input
                placeholder="e.g. Karan Verma"
                value={userForm.name}
                onChange={(e: any) => setUserForm({ ...userForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Email Address</label>
              <Input
                type="email"
                placeholder="e.g. karan@uryrestaurant.com"
                value={userForm.email}
                onChange={(e: any) => setUserForm({ ...userForm, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Role / Permissions</label>
              <Select
                value={userForm.role}
                onChange={(e: any) => setUserForm({ ...userForm, role: e.target.value })}
              >
                <option value="URY Cashier">URY Cashier</option>
                <option value="URY Captain">URY Captain / Waiter</option>
                <option value="URY Manager">URY Restaurant Manager</option>
                <option value="URY Kitchen User">Kitchen Display User</option>
              </Select>
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                Create User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default QuickActions;
