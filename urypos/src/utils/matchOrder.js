export function matchOrder(order, searchOrder) {
  const query = searchOrder.toLowerCase();
  return [order.name, order.customer, order.mobile_number].some(field =>
    (field || "").toLowerCase().includes(query)
  );
}
