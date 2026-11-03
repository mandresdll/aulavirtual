import { MockPaymentGateway } from './mock.js';
import { paymentGatewayContract } from './payment-gateway.contract.js';

paymentGatewayContract('mock', () => {
  const gateway = new MockPaymentGateway({ redirectBaseUrl: 'http://localhost:3000' });
  return {
    gateway,
    completePayment: async (token, outcome) => gateway.simulate(token, outcome),
  };
});
