---
name: data-catalog
description: How to explore the organization's data catalog and write safe read-only SQL over semantic views - list and describe record types first, one SELECT per query, bound parameters, no tenant filters.
---

# Data catalog

Use this skill whenever a question is about which data exists, what a field means, or
needs numbers or lists from the organization's data.

## Explore before you answer

1. `catalog.listEntities` returns the record types the user may see (id, kind, description).
   Narrow it with `query` or `kind` instead of listing everything.
2. `catalog.describeEntity` returns fields, relations and UI hints of one type. Read it
   before naming a field; never guess field names.
3. Types the user may not read do not appear. Say that the data is not available rather
   than guessing it exists.

## Safe SQL

- One statement, a plain `SELECT` (CTEs allowed) over `semantic.<view>` only.
- Values go in `params` as `$1`, `$2`, ... never inline user text into the SQL.
- Do not filter by tenant or organization: the server scopes every query to the caller.
- Only simple functions (aggregates, `date_trunc`, `coalesce`, comparisons) are accepted;
  anything else is rejected with a code. Fix the query instead of retrying the same one.
- Results are capped (100 rows by default, 1000 at most); say when `truncated` is true.

## Forms

To create or change data, call `catalog.renderForm` with the contract id, the command id
and the values the user already gave. The form saves nothing; the user submits it.
