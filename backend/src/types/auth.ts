export type AuthenticatedUser = {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role_key: string;
  is_admin: boolean;
};
