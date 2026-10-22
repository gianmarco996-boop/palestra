create extension if not exists "uuid-ossp";

create table if not exists public.exercises (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references auth.users(id) on delete cascade,
    name text not null,
    muscle_group text not null,
    equipment text not null,
    load_mode text not null check (load_mode in ('barbell', 'unilateral', 'total', 'bodyweight', 'other')),
    notes text,
    is_system boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.workout_templates (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.template_exercises (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    template_id uuid not null references public.workout_templates(id) on delete cascade,
    exercise_id uuid not null references public.exercises(id) on delete restrict,
    position integer not null check (position > 0),
    target_sets integer not null check (target_sets > 0),
    target_reps integer not null check (target_reps > 0),
    rest_seconds integer not null default 90,
    unique (template_id, position)
);

create table if not exists public.workouts (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    template_id uuid references public.workout_templates(id) on delete set null,
    name text not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    notes text,
    status text not null check (status in ('in_progress', 'completed', 'interrupted')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.workout_exercises (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    workout_id uuid not null references public.workouts(id) on delete cascade,
    exercise_id uuid not null references public.exercises(id) on delete restrict,
    position integer not null check (position > 0),
    created_at timestamptz not null default now(),
    unique (workout_id, position)
);

create table if not exists public.workout_sets (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
    set_number integer not null check (set_number > 0),
    weight_kg numeric(6,2),
    reps integer,
    rir integer,
    rpe numeric(3,1),
    rest_seconds integer not null default 90,
    is_completed boolean not null default true,
    set_type text not null default 'working' check (set_type in ('warmup', 'working')),
    load_mode text not null default 'barbell' check (load_mode in ('barbell', 'unilateral', 'total', 'bodyweight', 'other')),
    created_at timestamptz not null default now(),
    unique (workout_exercise_id, set_number)
);

create table if not exists public.body_measurements (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    measured_at timestamptz not null default now(),
    weight_kg numeric(6,2),
    body_fat_pct numeric(4,1),
    chest_cm numeric(5,2),
    waist_cm numeric(5,2),
    arm_cm numeric(5,2),
    thigh_cm numeric(5,2),
    created_at timestamptz not null default now()
);

create index if not exists idx_exercises_user_id on public.exercises(user_id);
create index if not exists idx_template_exercises_template_id on public.template_exercises(template_id);
create index if not exists idx_workouts_user_id on public.workouts(user_id);
create index if not exists idx_workout_exercises_workout_id on public.workout_exercises(workout_id);
create index if not exists idx_workout_sets_workout_exercise_id on public.workout_sets(workout_exercise_id);
create index if not exists idx_body_measurements_user_id on public.body_measurements(user_id);

alter table public.exercises enable row level security;
alter table public.workout_templates enable row level security;
alter table public.template_exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.body_measurements enable row level security;

create policy "Users can access their own exercises" on public.exercises
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can access their own template data" on public.workout_templates
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can access their own template exercises" on public.template_exercises
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can access their own workouts" on public.workouts
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can access their own workout exercises" on public.workout_exercises
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can access their own workout sets" on public.workout_sets
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can access their own measurements" on public.body_measurements
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
