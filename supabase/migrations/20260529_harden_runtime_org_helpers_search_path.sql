alter function public.is_org_member(uuid)
set search_path = public, auth;

alter function public.is_org_admin(uuid)
set search_path = public, auth;
