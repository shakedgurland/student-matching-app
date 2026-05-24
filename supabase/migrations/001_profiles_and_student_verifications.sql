-- 001_profiles_and_student_verifications.sql
-- Description: Initial schema setup for profiles and student verifications

-- 1. Create custom types
create type public.student_verification_status as enum ('pending', 'verified', 'rejected');

-- 2. Create public.profiles table
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  full_name text,
  avatar_url text,
  faculty text,
  year_of_study integer,
  bio text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create public.student_verifications table
create table public.student_verifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  student_email text not null,
  status public.student_verification_status default 'pending'::public.student_verification_status not null,
  verification_method text not null, -- e.g., 'email'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Set up updated_at function
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 5. Set up updated_at triggers
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_student_verifications_updated_at
  before update on public.student_verifications
  for each row execute function public.set_updated_at();

-- 6. Create handle_new_user function
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

-- 7. Create on_auth_user_created trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.student_verifications enable row level security;

-- 9. Profiles RLS Policies
create policy "Users can view their own profile."
  on public.profiles for select
  using ( auth.uid() = id );

create policy "Users can update their own profile."
  on public.profiles for update
  using ( auth.uid() = id );

create policy "Users can insert their own profile."
  on public.profiles for insert
  with check ( auth.uid() = id );

-- 10. Student Verifications RLS Policies
create policy "Users can view their own verification request."
  on public.student_verifications for select
  using ( auth.uid() = user_id );

create policy "Users can create their own verification request."
  on public.student_verifications for insert
  with check ( auth.uid() = user_id );

-- 11. Create Indexes
create index profiles_username_idx on public.profiles (username);
create index student_verifications_user_id_idx on public.student_verifications (user_id);
