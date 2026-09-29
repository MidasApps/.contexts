/**
 * Where the period selector reads its base dates and projects from.
 *
 * This used to be the literal `contratos`/`data_base_report`/`projeto`, which is
 * the securitization domain. A tenant from another domain (real estate) has no
 * `contratos`, and without base dates the `DataProvider` never triggers the
 * metrics. The route resolves the source from the client binding
 * (`resolveDateSource`) and passes it to `queryFilterOptions`. It lives in its
 * own module so tests that mock `queries` still see the default.
 */
export interface FilterSource {
  table: string;
  dateField: string;
  projectField: string | null;
}

export const DEFAULT_FILTER_SOURCE: FilterSource = {
  table: 'contratos',
  dateField: 'data_base_report',
  projectField: 'projeto',
};
