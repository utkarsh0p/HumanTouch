export type AuthenticatedUser = {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role_key: string;
  is_admin: boolean;
};

export type UserWithPasswordHash = AuthenticatedUser & {
  password_hash: string | null;
};
