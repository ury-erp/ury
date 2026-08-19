import type { OrderStatus } from '../../lib/api'

interface OrderStatusScreenProps {
  status: OrderStatus | null
  isPickup: boolean
  pickupCode?: string | null
  canAddMore: boolean
  onAddMore: () => void
  onDone?: () => void
}

/**
 * Post-submit confirmation/status screen. Deliberately scoped to what
 * `get_order_status` actually returns (`session_status`/`invoice`/`billed`/
 * `submitted`/`open_requests`) — there is no kitchen-stage data
 * (preparing/ready) on the backend, so this does not fabricate one.
 */
function OrderStatusScreen({ status, isPickup, pickupCode, canAddMore, onAddMore, onDone }: OrderStatusScreenProps) {
  const openRequests = status?.open_requests ?? []

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8 text-center">
      <h1 className="text-xl font-semibold">Order confirmed</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Thanks — your order has been sent to the restaurant.
      </p>

      {isPickup && pickupCode && (
        <div className="mt-6 w-full max-w-xs rounded-lg border bg-muted p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Pickup code</div>
          <div className="mt-1 text-3xl font-bold">{pickupCode}</div>
        </div>
      )}

      <div className="mt-6 w-full max-w-xs space-y-2 text-left text-sm">
        {status?.submitted !== undefined && (
          <div className="flex justify-between rounded-md border p-2">
            <span className="text-muted-foreground">Order status</span>
            <span className="font-medium">{status.submitted ? 'Submitted' : 'Pending'}</span>
          </div>
        )}
        {status?.billed !== undefined && (
          <div className="flex justify-between rounded-md border p-2">
            <span className="text-muted-foreground">Bill status</span>
            <span className="font-medium">{status.billed ? 'Billed' : 'Not billed yet'}</span>
          </div>
        )}
        {openRequests.length > 0 && (
          <div className="rounded-md border p-2">
            <div className="mb-1 text-muted-foreground">Open service requests</div>
            <ul className="space-y-1">
              {openRequests.map((request) => (
                <li key={request.name} className="flex justify-between">
                  <span>{request.request_type}</span>
                  <span className="font-medium">{request.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
        {canAddMore && (
          <button
            onClick={onAddMore}
            className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground"
          >
            Add more items
          </button>
        )}
        {onDone && (
          <button onClick={onDone} className="w-full rounded-md border py-3 font-medium">
            Done
          </button>
        )}
      </div>
    </div>
  )
}

export default OrderStatusScreen
