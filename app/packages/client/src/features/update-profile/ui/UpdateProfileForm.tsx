"use client";

import type { Me } from "@core/contracts";
import { useUpdateMe } from "#/entities/session/index.ts";
import { ApiError } from "#/shared/api/api-error.ts";
import { SchemaForm } from "#/shared/ui/organisms/SchemaForm/SchemaForm.tsx";
import type { SchemaFormResult } from "#/shared/ui/organisms/SchemaForm/server-errors.ts";
import { type ProfileForm, ProfileFormContract } from "../model/profile-form.contract.ts";

/**
 * Display name (`PATCH /v1/me`, SP2 spec §8 profile/account). Saving an unchanged name sends
 * nothing; the inline status confirms the save and server field errors map back to the input.
 */
export function UpdateProfileForm({ me }: { me: Me }) {
  const updateMe = useUpdateMe();
  const submit = async (values: ProfileForm): Promise<SchemaFormResult> => {
    if (values.displayName === me.displayName) return { ok: true };
    try {
      await updateMe({ displayName: values.displayName });
      return { ok: true };
    } catch (error: unknown) {
      if (error instanceof ApiError) return { ok: false, error };
      throw error;
    }
  };
  return (
    <SchemaForm
      contract={ProfileFormContract}
      defaultValues={{ displayName: me.displayName }}
      onSubmit={submit}
      requireChanges
    />
  );
}
