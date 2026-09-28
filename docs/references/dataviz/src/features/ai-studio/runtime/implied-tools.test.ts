import { describe, it, expect } from 'vitest';
import { withImpliedTools } from './implied-tools';

describe('withImpliedTools', () => {
  it('adds get_table_schema to an agent that runs SQL', () => {
    expect(withImpliedTools(['execute_sql', 'run_clustering'])).toEqual(['execute_sql', 'run_clustering', 'get_table_schema']);
    expect(withImpliedTools(['dry_run_sql'])).toEqual(['dry_run_sql', 'get_table_schema']);
  });

  it('does not duplicate it', () => {
    expect(withImpliedTools(['execute_sql', 'get_table_schema'])).toEqual(['execute_sql', 'get_table_schema']);
  });

  it('leaves agents that do not run SQL alone', () => {
    expect(withImpliedTools(['create_report'])).toEqual(['create_report']);
    expect(withImpliedTools([])).toEqual([]);
  });
});
