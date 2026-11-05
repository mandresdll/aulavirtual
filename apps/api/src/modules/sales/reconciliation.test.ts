import { describe, expect, it } from 'vitest';
import { compareTransaction } from './reconciliation.js';

const local = (status: string, amountClp = 1000) => ({ status, amountClp });
const gateway = (status: Parameters<typeof compareTransaction>[1]['status'], amount = 1000) => ({
  status,
  amount,
});

describe('compareTransaction', () => {
  it('accepts matching states', () => {
    expect(compareTransaction(local('authorized'), gateway('authorized'))).toEqual([]);
    expect(compareTransaction(local('partially_refunded'), gateway('partially_nullified'))).toEqual(
      [],
    );
    expect(compareTransaction(local('refunded'), gateway('reversed'))).toEqual([]);
    expect(compareTransaction(local('refunded'), gateway('nullified'))).toEqual([]);
  });

  it('accepts payments without a charge on either side', () => {
    expect(compareTransaction(local('rejected'), gateway('failed'))).toEqual([]);
    expect(compareTransaction(local('aborted'), gateway('initialized'))).toEqual([]);
    expect(compareTransaction(local('created'), gateway('initialized'))).toEqual([]);
  });

  it('flags a charge the platform does not know about', () => {
    expect(compareTransaction(local('rejected'), gateway('authorized'))).toEqual([
      'status_mismatch',
    ]);
    expect(compareTransaction(local('created'), gateway('authorized'))).toEqual([
      'status_mismatch',
    ]);
  });

  it('flags a refund that only one side has', () => {
    expect(compareTransaction(local('authorized'), gateway('reversed'))).toEqual([
      'status_mismatch',
    ]);
    expect(compareTransaction(local('refunded'), gateway('authorized'))).toEqual([
      'status_mismatch',
    ]);
  });

  it('flags a different amount', () => {
    expect(compareTransaction(local('authorized'), gateway('authorized', 900))).toEqual([
      'amount_mismatch',
    ]);
  });
});
