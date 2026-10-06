"use client";

import { createContext, useContext } from "react";

/** Ids and state one `Field` shares with its label, control, description and error. */
export type FieldContextValue = {
  controlId: string;
  descriptionId: string;
  errorId: string;
  invalid: boolean;
  hasDescription: boolean;
  hasError: boolean;
  registerDescription: (present: boolean) => void;
  registerError: (present: boolean) => void;
};

export const FieldContext = createContext<FieldContextValue | null>(null);

/** The surrounding `Field`, or `null` when a part is used on its own. */
export const useFieldContext = (): FieldContextValue | null => useContext(FieldContext);
