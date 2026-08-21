import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { useBranchContext } from '../../context/BranchContext';

type ModalType = 'menu' | 'table' | 'room' | 'branch' | 'user' | null;

export const QuickActions: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
    showNotification(t('quickactions.save_item') + ` "${menuForm.name}"`);
    setMenuForm({ name: '', course: 'Main Course', price: '' });
    handleClose();
    refreshDashboard();
  };

  const handleSubmitTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableForm.name) return;
    showNotification(t('quickactions.save_table') + ` "${tableForm.name}"`);
    setTableForm({ name: '', seats: '4', room: 'Main Dining', shape: 'Square' });
    handleClose();
    refreshDashboard();
  };

  const handleSubmitRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomForm.name) return;
    showNotification(t('quickactions.save_zone') + ` "${roomForm.name}"`);
    setRoomForm({ name: '', type: 'AC', branch: 'Downtown Main' });
    handleClose();
    refreshDashboard();
  };

  const handleSubmitBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchForm.name) return;
    showNotification(t('quickactions.create_branch') + ` "${branchForm.name}"`);
    setBranchForm({ name: '', code: '', invoicePrefix: 'INV-' });
    handleClose();
    refreshDashboard();
  };

  const handleSubmitUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name || !userForm.email) return;
    showNotification(t('quickactions.create_user') + ` "${userForm.name}"`);
    setUserForm({ name: '', email: '', role: 'URY Cashier' });
    handleClose();
    refreshDashboard();
  };

  const actionCards = [
    {
      title: t('quickactions.open_pos'),
      description: t('quickactions.open_pos_description'),
      actionText: t('quickactions.open_pos_button'),
      color: 'bg-purple-600 hover:bg-purple-700 text-white',
      border: 'border-purple-200',
      icon: (
        <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      title: t('quickactions.add_menu'),
      description: t('quickactions.add_menu_description'),
      actionText: t('quickactions.add_menu_button'),
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
      title: t('quickactions.add_table'),
      description: t('quickactions.add_table_description'),
      actionText: t('quickactions.add_table_button'),
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
      title: t('quickactions.add_room'),
      description: t('quickactions.add_room_description'),
      actionText: t('quickactions.add_room_button'),
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
      title: t('quickactions.add_branch'),
      description: t('quickactions.add_branch_description'),
      actionText: t('quickactions.add_branch_button'),
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
      title: t('quickactions.add_user'),
      description: t('quickactions.add_user_description'),
      actionText: t('quickactions.add_user_button'),
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
            {t('quickactions.dismiss')}
          </button>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between pb-3 border-b border-gray-200 -mx-6 px-6 -mt-6 pt-6">
        <h2 className="text-lg font-bold text-gray-900">{t('quickactions.heading')}</h2>
        <span className="text-xs text-gray-500 font-medium">{t('quickactions.subheading')}</span>
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
            <DialogTitle className="text-lg font-bold text-gray-900">{t('quickactions.modal_add_menu')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitMenu} className="space-y-4 mt-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_item_name')}</label>
              <Input
                placeholder="Paneer Tikka Masala"
                value={menuForm.name}
                onChange={(e: any) => setMenuForm({ ...menuForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_course')}</label>
              <SearchableSelect
                id="course"
                value={menuForm.course}
                onChange={(_, value) => setMenuForm({ ...menuForm, course: value })}
                options={[
                  { value: 'Starters', label: 'Starters / Appetizers' },
                  { value: 'Main Course', label: 'Main Course' },
                  { value: 'Breads', label: 'Breads & Naan' },
                  { value: 'Dessert', label: 'Dessert' },
                  { value: 'Beverages', label: 'Beverages' },
                ]}
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_price')}</label>
              <Input
                type="number"
                placeholder="280"
                value={menuForm.price}
                onChange={(e: any) => setMenuForm({ ...menuForm, price: e.target.value })}
                required
              />
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2 rtl:space-x-reverse">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('quickactions.cancel')}
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                {t('quickactions.save_item')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. Add Table Drawer/Dialog */}
      <Dialog open={activeModal === 'table'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-gray-200 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">{t('quickactions.modal_add_table')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitTable} className="space-y-4 mt-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_table_name')}</label>
              <Input
                placeholder="T-15"
                value={tableForm.name}
                onChange={(e: any) => setTableForm({ ...tableForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_seats')}</label>
              <Input
                type="number"
                placeholder="4"
                value={tableForm.seats}
                onChange={(e: any) => setTableForm({ ...tableForm, seats: e.target.value })}
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_dining_room')}</label>
              <SearchableSelect
                id="room"
                value={tableForm.room}
                onChange={(_, value) => setTableForm({ ...tableForm, room: value })}
                options={[
                  { value: 'Main Dining', label: 'Main Dining' },
                  { value: 'Terrace Garden', label: 'Terrace Garden' },
                  { value: 'AC Family Section', label: 'AC Family Section' },
                  { value: 'VIP Lounge', label: 'VIP Lounge' },
                ]}
              />
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2 rtl:space-x-reverse">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('quickactions.cancel')}
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                {t('quickactions.save_table')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3. Add Room / Zone Dialog */}
      <Dialog open={activeModal === 'room'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-gray-200 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">{t('quickactions.modal_add_room')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitRoom} className="space-y-4 mt-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_zone_name')}</label>
              <Input
                placeholder="Outdoor Deck"
                value={roomForm.name}
                onChange={(e: any) => setRoomForm({ ...roomForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_zone_type')}</label>
              <SearchableSelect
                id="type"
                value={roomForm.type}
                onChange={(_, value) => setRoomForm({ ...roomForm, type: value })}
                options={[
                  { value: 'AC', label: 'AC Dining' },
                  { value: 'Non-AC', label: 'Non-AC Dining' },
                  { value: 'Rooftop', label: 'Rooftop / Open Air' },
                  { value: 'Bar', label: 'Bar & Lounge' },
                ]}
              />
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2 rtl:space-x-reverse">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('quickactions.cancel')}
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                {t('quickactions.save_zone')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 4. Add Branch Dialog */}
      <Dialog open={activeModal === 'branch'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-gray-200 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">{t('quickactions.modal_add_branch')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitBranch} className="space-y-4 mt-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_branch_name')}</label>
              <Input
                placeholder="Waterfront Bistro"
                value={branchForm.name}
                onChange={(e: any) => setBranchForm({ ...branchForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_branch_code')}</label>
              <Input
                placeholder="WF-05"
                value={branchForm.code}
                onChange={(e: any) => setBranchForm({ ...branchForm, code: e.target.value })}
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_invoice_prefix')}</label>
              <Input
                placeholder="INV-WF-"
                value={branchForm.invoicePrefix}
                onChange={(e: any) => setBranchForm({ ...branchForm, invoicePrefix: e.target.value })}
              />
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2 rtl:space-x-reverse">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('quickactions.cancel')}
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                {t('quickactions.create_branch')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Add User Dialog */}
      <Dialog open={activeModal === 'user'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border border-gray-200 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">{t('quickactions.modal_add_user')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitUser} className="space-y-4 mt-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_full_name')}</label>
              <Input
                placeholder="Karan Verma"
                value={userForm.name}
                onChange={(e: any) => setUserForm({ ...userForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_email')}</label>
              <Input
                type="email"
                placeholder="karan@uryrestaurant.com"
                value={userForm.email}
                onChange={(e: any) => setUserForm({ ...userForm, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('quickactions.field_role')}</label>
              <SearchableSelect
                id="role"
                value={userForm.role}
                onChange={(_, value) => setUserForm({ ...userForm, role: value })}
                options={[
                  { value: 'URY Cashier', label: 'URY Cashier' },
                  { value: 'URY Captain', label: 'URY Captain / Waiter' },
                  { value: 'URY Manager', label: 'URY Restaurant Manager' },
                  { value: 'URY Kitchen User', label: 'Kitchen Display User' },
                ]}
              />
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2 rtl:space-x-reverse">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('quickactions.cancel')}
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                {t('quickactions.create_user')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default QuickActions;
