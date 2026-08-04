import { useState } from 'react';
import { WizardLayout } from '../../components/setup/WizardLayout';
import { ConfigureItem } from '../../components/setup/ConfigureItem';
import { call } from '@ury/core';
import configureItems from '../../data/forms/configure.json';

export default function ConfigurePage() {
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [finishing, setFinishing] = useState(false);

  const handleItemClick = (id: string) => {
    setCompletedItems(prev => {
      const newSet = new Set(prev);
      newSet.add(id);
      return newSet;
    });
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await call('frappe.client.set_value', { 
        doctype: "System Settings", 
        name: "System Settings", 
        fieldname: "setup_complete", 
        value: 1 
      });
      window.location.href = '/app';
    } catch (err) {
      console.error("Failed to finish setup", err);
      // Fallback
      window.location.href = '/app';
    }
  };

  return (
    <WizardLayout 
      step={2} 
      nextLabel="Finish Setup"
      onNext={handleFinish} 
      isNextLoading={finishing}
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-1">Optional Configuration</h2>
          <p className="text-[#6B7280] text-sm">
            {configureItems.footer || "These settings are optional and can be configured anytime after installation."}
          </p>
        </div>

        <div className="border border-[#F3F4F6] rounded-xl overflow-hidden bg-white">
          {configureItems.items?.map((item: any) => (
            <ConfigureItem 
              key={item.id} 
              item={item} 
              completed={completedItems.has(item.id)} 
              onClick={handleItemClick}
            />
          ))}
        </div>
      </div>
    </WizardLayout>
  );
}
