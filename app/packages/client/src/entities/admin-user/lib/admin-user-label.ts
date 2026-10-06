/** How a user is named in admin lists: the display name, else the email, else the id. */
export const adminUserLabel = (user: {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string;
}): string => {
  const name = user.displayName.trim();
  if (name !== "") return name;
  return user.email ?? user.id;
};
