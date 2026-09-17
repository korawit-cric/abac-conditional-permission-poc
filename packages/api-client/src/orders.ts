import type {
  AccessSummary,
  ApiEndpoint,
  ApiEndpointWithBody,
  OrderResponse,
  OrderStatus,
} from './types.js';

export const ordersApi = {
  accessSummary: (): ApiEndpoint<AccessSummary> => ({
    url: '/orders/access-summary',
    method: 'GET',
  }),
  detail: (id: string): ApiEndpoint<OrderResponse> => ({
    url: `/orders/${id}`,
    method: 'GET',
  }),
  updateStatus: (
    id: string,
    status: OrderStatus,
  ): ApiEndpointWithBody<
    { status: OrderStatus },
    { orderId: string; from: OrderStatus; to: OrderStatus }
  > => ({
    url: `/orders/${id}`,
    method: 'PATCH',
    body: { status },
  }),
  refund: (
    id: string,
  ): ApiEndpoint<{ orderId: string; status: 'REFUNDED' }> => ({
    url: `/orders/${id}/refund`,
    method: 'POST',
  }),
};
