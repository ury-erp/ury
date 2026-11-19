import { beforeEach, expect, test, vi } from 'vitest';

const client = vi.hoisted(() => ({
  call: { get: vi.fn() },
  db: { getDocList: vi.fn() },
}));

vi.mock('@ury/core', () => client);

import { getProductionUnitsForBranch } from '../src/lib/production-api';

beforeEach(() => {
  vi.resetAllMocks();
  client.call.get.mockImplementation(async (method: string) => {
    if (method === 'ury.ury_pos.api.getBranch') return { message: 'Salama' };
    throw new Error(`HTTP 417: no attribute for ${method}`);
  });
  client.db.getDocList.mockImplementation(async (doctype: string, options: any) => {
    if (doctype !== 'URY Production Unit') throw new Error('Wrong DocType');
    const branch = options.filters?.find(([field]: string[]) => field === 'branch')?.[2];
    const rows = [
      { name: 'Salama Kitchen', branch: 'Salama', readable: true },
      { name: 'Salama Bar', branch: 'Salama', readable: true },
      { name: 'Private Kitchen', branch: 'Salama', readable: false },
      { name: 'Training Kitchen', branch: 'Salama Training', readable: true },
    ];
    return rows.filter((row) => row.readable && row.branch === branch)
      .map(({ name }) => ({ name }));
  });
});

test('KOT monitoring receives permitted production unit names for the session branch', async () => {
  expect(await getProductionUnitsForBranch()).toEqual(['Salama Kitchen', 'Salama Bar']);
  expect(client.db.getDocList).toHaveBeenCalledWith('URY Production Unit', {
    fields: ['name'],
    filters: [['branch', '=', 'Salama']],
    limit: 0,
  });
});

test('a different session branch selects only that branch production units', async () => {
  client.call.get.mockResolvedValue({ message: 'Salama Training' });

  expect(await getProductionUnitsForBranch()).toEqual(['Training Kitchen']);
});

test('all production units are included beyond the native default page size', async () => {
  const units = Array.from({ length: 25 }, (_, index) => ({ name: `Kitchen ${index + 1}` }));
  client.db.getDocList.mockImplementation(async (_doctype: string, options: any) =>
    options.limit === 0 ? units : units.slice(0, 20));

  expect(await getProductionUnitsForBranch()).toEqual(units.map(({ name }) => name));
});

test('an empty branch is never used to make an unscoped production-unit query', async () => {
  client.call.get.mockResolvedValue({ message: '' });
  client.db.getDocList.mockResolvedValue([{ name: 'Other Branch Kitchen' }]);

  expect(await getProductionUnitsForBranch()).toEqual([]);
  expect(client.db.getDocList).not.toHaveBeenCalled();
});

test('a user without a branch retains the empty result', async () => {
  client.call.get.mockRejectedValue(new Error('User is not associated with any branch'));

  expect(await getProductionUnitsForBranch()).toEqual([]);
  expect(client.db.getDocList).not.toHaveBeenCalled();
});

test('a document permission failure retains the empty result', async () => {
  client.db.getDocList.mockRejectedValue(new Error('Permission denied'));

  expect(await getProductionUnitsForBranch()).toEqual([]);
});

test('a branch with no production units retains the empty result', async () => {
  client.db.getDocList.mockResolvedValue([]);

  expect(await getProductionUnitsForBranch()).toEqual([]);
});
