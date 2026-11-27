// Changing the order type must not silently empty the cart, and a Take Away /
// Delivery check must not keep the dine-in table.
// Oracle Simphony: a check's order type belongs to the check; a Take Out
// check has no table (docs.oracle.com/en/industries/food-beverage/simphony/19.5/simcg/c_order_types.htm).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import OrderTypeSelect from './OrderTypeSelect';

vi.mock('../lib/menu-api', () => ({ getRestaurantMenu: vi.fn(async () => []), getAggregatorMenu: vi.fn(async () => []) }));
vi.mock('./TableSelectionDialog', () => ({ default: () => null }));

const items = [
  { id: 'Tea', uniqueId: 'L1', name: 'Tea', price: 2000, quantity: 1 },
  { id: 'Rolex', uniqueId: 'L2', name: 'Rolex', price: 8000, quantity: 2 },
] as never[];

let host: HTMLDivElement;
let root: Root;

function dineInWithCart(cart = items) {
  usePOSStore.setState({
    posProfile: { name: 'Till A' } as never,
    selectedOrderType: 'Dine In', selectedTable: 'C-3', selectedRoom: 'Garden',
    activeOrders: cart, isUpdatingOrder: false, orderId: null,
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useRootStore.setState({ user: { name: 'cashier@example.com', roles: ['URY Cashier'] } as never });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = () => act(async () => root.render(<OrderTypeSelect />));
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
const click = (label: string) => act(async () => { button(label)!.click(); });
const dialog = () => document.querySelector('[role="dialog"]');

it('store: leaving Dine In releases the table and room', () => {
  dineInWithCart();
  usePOSStore.getState().setSelectedOrderType('Take Away');
  const s = usePOSStore.getState();
  expect([s.selectedOrderType, s.selectedTable, s.selectedRoom, s.activeOrders.length]).toEqual(['Take Away', null, null, 0]);
});

it('store: an empty Dine In cart switched to Take Away keeps no table', () => {
  dineInWithCart([]);
  usePOSStore.getState().setSelectedOrderType('Take Away');
  expect(usePOSStore.getState().selectedTable).toBeNull();
});

it('asks before a type change empties the cart; Cancel keeps type, cart and table', async () => {
  dineInWithCart();
  await render();
  await click('Take Away');
  expect(dialog()?.textContent).toContain('Switching to Take Away clears this order. Items in the cart: 2.');
  await click('Cancel');
  const s = usePOSStore.getState();
  expect(dialog()).toBeNull();
  expect([s.selectedOrderType, s.selectedTable, s.selectedRoom, s.activeOrders.length]).toEqual(['Dine In', 'C-3', 'Garden', 2]);
});

it('confirming clears the cart and releases the table', async () => {
  dineInWithCart();
  await render();
  await click('Take Away');
  await click('Clear and switch');
  const s = usePOSStore.getState();
  expect(dialog()).toBeNull();
  expect([s.selectedOrderType, s.selectedTable, s.activeOrders.length]).toEqual(['Take Away', null, 0]);
});

it('an empty cart switches without asking', async () => {
  dineInWithCart([]);
  await render();
  await click('Take Away');
  expect(dialog()).toBeNull();
  expect(usePOSStore.getState().selectedOrderType).toBe('Take Away');
});

it('tapping the current type again does not empty the cart', async () => {
  usePOSStore.setState({
    posProfile: { name: 'Till A' } as never, selectedOrderType: 'Take Away', selectedTable: null,
    selectedRoom: null, activeOrders: items, isUpdatingOrder: false, orderId: null,
  });
  await render();
  await click('Take Away');
  expect(dialog()).toBeNull();
  expect(usePOSStore.getState().activeOrders.length).toBe(2);
});
